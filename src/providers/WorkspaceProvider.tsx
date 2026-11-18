'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { api } from '~/trpc/react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  validateHomeLayout,
  type HomeLayout,
} from '~/app/_components/home/HomeLayoutPicker';

interface WorkspaceMember {
  userId: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    isAgent: boolean;
    /** Present for agent members: the agent's own (workspace-independent) description. */
    externalAgentShadow?: { description: string | null } | null;
  };
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  aiInstructions: string | null;
  logoUrl: string | null;
  type: string;
  homeLayout: HomeLayout;
  // null = follow the workspace type (team/org on, personal off). See the
  // column comment in schema.prisma and the resolution in useTerminology.
  enableKeyResults: boolean | null;
  members?: WorkspaceMember[];
}

interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaceSlug: string | null;
  workspaceId: string | null;
  isLoading: boolean;
  userRole: 'owner' | 'admin' | 'member' | 'viewer' | 'guest' | null;
  switchWorkspace: (slug: string) => void;
  refetchWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  workspaceSlug: null,
  workspaceId: null,
  isLoading: true,
  userRole: null,
  switchWorkspace: () => {
    // Default no-op
  },
  refetchWorkspace: () => {
    // Default no-op
  },
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

/**
 * The workspace this browser last had open. Routes with no workspace in the URL
 * (`/settings/...`, `/today`, ...) read it on a full page load, so they come back
 * in the workspace the person was working in rather than their default one.
 */
export const LAST_WORKSPACE_STORAGE_KEY = 'exponential:last-workspace-slug';

function readLastWorkspaceSlug(): string | null {
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLastWorkspaceSlug(slug: string | null) {
  try {
    if (slug) {
      window.localStorage.setItem(LAST_WORKSPACE_STORAGE_KEY, slug);
    } else {
      window.localStorage.removeItem(LAST_WORKSPACE_STORAGE_KEY);
    }
  } catch {
    // Storage is unavailable (private window, blocked site data): the default
    // workspace still loads, the choice just isn't remembered.
  }
}

/**
 * Account settings carry no workspace in the URL, so the switcher there changes
 * which workspace the page acts on instead of leaving it for the workspace home.
 */
function isAccountSettingsPath(pathname: string | null): boolean {
  return pathname === '/settings' || (pathname?.startsWith('/settings/') ?? false);
}

interface WorkspaceProviderProps extends PropsWithChildren {
  initialWorkspaceSlug?: string;
}

export function WorkspaceProvider({
  children,
  initialWorkspaceSlug,
}: WorkspaceProviderProps) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();

  // Get workspace slug from URL params or prop
  const urlSlug =
    (params?.workspaceSlug as string | undefined) ?? initialWorkspaceSlug ?? null;

  // Track the context workspace slug (can be set without URL change)
  const [contextWorkspaceSlug, setContextWorkspaceSlug] = useState<string | null>(urlSlug);
  const [hasInitialized, setHasInitialized] = useState(!!urlSlug);
  // The remembered workspace is read after mount, not during render: the server
  // has no access to it, so reading it earlier would break hydration.
  const [hasCheckedStorage, setHasCheckedStorage] = useState(!!urlSlug);

  useEffect(() => {
    if (hasCheckedStorage) return;
    if (!urlSlug) {
      const storedSlug = readLastWorkspaceSlug();
      if (storedSlug) {
        setContextWorkspaceSlug(storedSlug);
        setHasInitialized(true);
      }
    }
    setHasCheckedStorage(true);
  }, [hasCheckedStorage, urlSlug]);

  // Fetch default workspace when no slug in URL and none remembered
  const { data: defaultWorkspace, isLoading: defaultLoading, isFetched: defaultFetched } = api.workspace.getDefault.useQuery(
    undefined,
    {
      enabled: !urlSlug && !hasInitialized && hasCheckedStorage,
      staleTime: 5 * 60 * 1000,
    }
  );

  // Auto-create personal workspace if user has none
  const utils = api.useUtils();
  const { mutate: ensurePersonalWorkspace, isPending: isCreatingWorkspace, isError: createWorkspaceError } =
    api.workspace.ensurePersonalWorkspace.useMutation({
      onSuccess: (workspace) => {
        setContextWorkspaceSlug(workspace.slug);
        setHasInitialized(true);
        void utils.workspace.getDefault.invalidate();
      },
    });

  useEffect(() => {
    if (!urlSlug && defaultFetched && !defaultWorkspace && !hasInitialized && !isCreatingWorkspace && !createWorkspaceError) {
      ensurePersonalWorkspace();
    }
  }, [urlSlug, defaultFetched, defaultWorkspace, hasInitialized, isCreatingWorkspace, createWorkspaceError, ensurePersonalWorkspace]);

  // Use URL slug if present, otherwise use context workspace slug
  const effectiveSlug = urlSlug ?? contextWorkspaceSlug;

  // Fetch workspace data when we have a slug
  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
    refetch,
  } = api.workspace.getBySlug.useQuery(
    { slug: effectiveSlug! },
    {
      enabled: !!effectiveSlug,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      // Don't retry on permission/not-found errors — re-validate on
      // navigation instead and let the redirect effect below handle them.
      retry: (failureCount, err) => {
        const code = (err as { data?: { code?: string } } | null)?.data?.code;
        if (code === 'FORBIDDEN' || code === 'NOT_FOUND' || code === 'UNAUTHORIZED') {
          return false;
        }
        return failureCount < 2;
      },
    }
  );

  // Graceful 403 handling: when the user has lost access to the workspace
  // (e.g. a guest's last project membership was revoked) redirect them out
  // of the shell so no stale data or error overlay is shown.
  //
  // A workspace that came from memory rather than the URL (remembered from an
  // earlier visit, or carried over from the last page) is dropped in favour of
  // the default one instead: the page itself is still valid. The default is the
  // last resort, so when it is the one that fails the redirect still applies,
  // as it does for a slug that was already dropped once and came straight back.
  const droppedSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (!workspaceError) return;
    const code = (workspaceError as { data?: { code?: string } } | null)?.data?.code;
    if (code !== 'FORBIDDEN' && code !== 'NOT_FOUND' && code !== 'UNAUTHORIZED') return;

    if (readLastWorkspaceSlug() === effectiveSlug) {
      writeLastWorkspaceSlug(null);
    }
    if (
      !urlSlug &&
      effectiveSlug !== defaultWorkspace?.slug &&
      effectiveSlug !== droppedSlugRef.current
    ) {
      droppedSlugRef.current = effectiveSlug;
      setContextWorkspaceSlug(null);
      setHasInitialized(false);
      return;
    }
    router.replace('/');
  }, [workspaceError, router, urlSlug, effectiveSlug, defaultWorkspace?.slug]);

  // Remember the workspace once it has actually loaded, so a slug the person
  // cannot open is never stored.
  const loadedWorkspaceSlug = workspace?.slug ?? null;
  useEffect(() => {
    if (loadedWorkspaceSlug) writeLastWorkspaceSlug(loadedWorkspaceSlug);
  }, [loadedWorkspaceSlug]);

  // Set default workspace when loaded (without URL navigation). getDefault
  // already carries the workspace in getBySlug's shape: seed that cache first so
  // the getBySlug query below starts with data instead of a second round trip.
  useEffect(() => {
    if (!urlSlug && defaultWorkspace && !hasInitialized) {
      if (defaultWorkspace.details && !utils.workspace.getBySlug.getData({ slug: defaultWorkspace.slug })) {
        utils.workspace.getBySlug.setData({ slug: defaultWorkspace.slug }, defaultWorkspace.details);
      }
      setContextWorkspaceSlug(defaultWorkspace.slug);
      setHasInitialized(true);
    }
  }, [urlSlug, defaultWorkspace, hasInitialized, utils]);

  // Sync with URL changes
  useEffect(() => {
    if (urlSlug) {
      setContextWorkspaceSlug(urlSlug);
      setHasInitialized(true);
    }
  }, [urlSlug]);

  const switchWorkspace = useCallback(
    (slug: string) => {
      setContextWorkspaceSlug(slug);
      setHasInitialized(true);
      if (isAccountSettingsPath(pathname)) return;
      // Navigate to the new workspace's home page
      router.push(`/w/${slug}/home`);
    },
    [router, pathname]
  );

  const refetchWorkspace = useCallback(() => {
    void refetch();
  }, [refetch]);

  const isLoading = effectiveSlug
    ? workspaceLoading
    : (!hasInitialized && (!hasCheckedStorage || defaultLoading || isCreatingWorkspace));

  // Narrow Prisma's `homeLayout: string` to the `HomeLayout` union so consumers
  // (e.g. the home-page router) don't have to repeat the validation.
  const narrowedWorkspace = workspace
    ? { ...workspace, homeLayout: validateHomeLayout(workspace.homeLayout) }
    : null;

  const value: WorkspaceContextValue = {
    workspace: narrowedWorkspace,
    workspaceSlug: effectiveSlug,
    workspaceId: workspace?.id ?? null,
    isLoading,
    userRole: (workspace?.currentUserRole as WorkspaceContextValue['userRole']) ?? null,
    switchWorkspace,
    refetchWorkspace,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
