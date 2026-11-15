import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';

const { mockReplace, mockPush, mockUseParams, mockUsePathname, mockGetBySlug, mockGetDefault, mockEnsureWS } =
  vi.hoisted(() => ({
    mockReplace: vi.fn(),
    mockPush: vi.fn(),
    mockUseParams: vi.fn((): { workspaceSlug?: string } => ({ workspaceSlug: 'revoked-ws' })),
    mockUsePathname: vi.fn(() => '/w/revoked-ws/home'),
    mockGetBySlug: vi.fn(),
    mockGetDefault: vi.fn(),
    mockEnsureWS: vi.fn(),
  }));

vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('~/trpc/react', () => ({
  api: {
    workspace: {
      getBySlug: { useQuery: (...args: unknown[]) => mockGetBySlug(...args) },
      getDefault: { useQuery: (...args: unknown[]) => mockGetDefault(...args) },
      ensurePersonalWorkspace: { useMutation: () => mockEnsureWS() },
    },
    useUtils: () => ({
      workspace: {
        getDefault: { invalidate: vi.fn() },
      },
    }),
  },
}));

// Import after mocks are set up.
import {
  WorkspaceProvider,
  useWorkspace,
  LAST_WORKSPACE_STORAGE_KEY,
} from '../WorkspaceProvider';

describe('WorkspaceProvider — graceful 403 handling', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockUseParams.mockReturnValue({ workspaceSlug: 'revoked-ws' });
    mockUsePathname.mockReturnValue('/w/revoked-ws/home');
    window.localStorage.clear();
    mockGetDefault.mockReturnValue({ data: undefined, isLoading: false, isFetched: true });
    mockEnsureWS.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects to / when workspace.getBySlug returns FORBIDDEN', async () => {
    mockGetBySlug.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { data: { code: 'FORBIDDEN' } },
      refetch: vi.fn(),
    });

    render(
      <WorkspaceProvider>
        <div>child</div>
      </WorkspaceProvider>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('redirects to / when workspace.getBySlug returns NOT_FOUND', async () => {
    mockGetBySlug.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { data: { code: 'NOT_FOUND' } },
      refetch: vi.fn(),
    });

    render(
      <WorkspaceProvider>
        <div>child</div>
      </WorkspaceProvider>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('does NOT redirect on transient/non-access errors', async () => {
    mockGetBySlug.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { data: { code: 'INTERNAL_SERVER_ERROR' } },
      refetch: vi.fn(),
    });

    render(
      <WorkspaceProvider>
        <div>child</div>
      </WorkspaceProvider>,
    );

    // Wait a tick; replace should not be called.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does NOT redirect when the query succeeds', async () => {
    mockGetBySlug.mockReturnValue({
      data: {
        id: 'w1',
        name: 'Test',
        slug: 'revoked-ws',
        description: null,
        logoUrl: null,
        type: 'team',
        currentUserRole: 'guest',
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <WorkspaceProvider>
        <div>child</div>
      </WorkspaceProvider>,
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('WorkspaceProvider — routes with no workspace in the URL', () => {
  interface QueryOptions {
    enabled?: boolean;
  }

  const workspaceRow = (slug: string) => ({
    id: `id-${slug}`,
    name: slug,
    slug,
    description: null,
    logoUrl: null,
    type: 'team',
    currentUserRole: 'owner',
  });

  /** Every slug loads, except the ones listed, which answer FORBIDDEN. */
  const answerBySlug = (forbidden: string[] = []) => {
    mockGetBySlug.mockImplementation((input: { slug: string | null }, options: QueryOptions) => {
      if (!options.enabled || !input.slug) {
        return { data: undefined, isLoading: false, error: null, refetch: vi.fn() };
      }
      if (forbidden.includes(input.slug)) {
        return {
          data: undefined,
          isLoading: false,
          error: { data: { code: 'FORBIDDEN' } },
          refetch: vi.fn(),
        };
      }
      return { data: workspaceRow(input.slug), isLoading: false, error: null, refetch: vi.fn() };
    });
  };

  /**
   * The default workspace is `clear`. Like the real query, it answers nothing
   * until it is first enabled and keeps its data once it has been fetched.
   */
  const answerDefault = () => {
    let hasFetched = false;
    mockGetDefault.mockImplementation((_input: undefined, options: QueryOptions) => {
      if (options.enabled) hasFetched = true;
      return hasFetched
        ? { data: { id: 'id-clear', slug: 'clear', name: 'Clear', type: 'team', details: null }, isLoading: false, isFetched: true }
        : { data: undefined, isLoading: false, isFetched: false };
    });
  };

  let current: ReturnType<typeof useWorkspace>;
  function Probe() {
    current = useWorkspace();
    return <div data-testid="slug">{current.workspaceSlug ?? 'none'}</div>;
  }

  const renderOnSettings = () =>
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );

  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockUseParams.mockReturnValue({});
    mockUsePathname.mockReturnValue('/settings/integrations');
    window.localStorage.clear();
    mockGetDefault.mockClear();
    mockEnsureWS.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    answerBySlug();
    answerDefault();
  });

  afterEach(() => {
    cleanup();
  });

  it('opens in the default workspace when none is remembered', async () => {
    const { getByTestId } = renderOnSettings();

    await waitFor(() => {
      expect(getByTestId('slug')).toHaveTextContent('clear');
    });
  });

  it('opens in the remembered workspace instead of the default one', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_STORAGE_KEY, 'exponential');

    const { getByTestId } = renderOnSettings();

    await waitFor(() => {
      expect(getByTestId('slug')).toHaveTextContent('exponential');
    });
    // The default workspace is never asked for: the query stays disabled.
    const askedForDefault = mockGetDefault.mock.calls.some(
      ([, options]) => (options as QueryOptions).enabled,
    );
    expect(askedForDefault).toBe(false);
  });

  it('switches workspace in place on account settings and remembers it', async () => {
    const { getByTestId } = renderOnSettings();
    await waitFor(() => {
      expect(getByTestId('slug')).toHaveTextContent('clear');
    });

    act(() => {
      current.switchWorkspace('exponential');
    });

    await waitFor(() => {
      expect(getByTestId('slug')).toHaveTextContent('exponential');
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LAST_WORKSPACE_STORAGE_KEY)).toBe('exponential');
  });

  it('still goes to the workspace home when switching anywhere else', async () => {
    mockUsePathname.mockReturnValue('/today');
    const { getByTestId } = renderOnSettings();
    await waitFor(() => {
      expect(getByTestId('slug')).toHaveTextContent('clear');
    });

    act(() => {
      current.switchWorkspace('exponential');
    });

    expect(mockPush).toHaveBeenCalledWith('/w/exponential/home');
  });

  it('falls back to the default workspace when the remembered one is no longer reachable', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_STORAGE_KEY, 'left-this-one');
    answerBySlug(['left-this-one']);

    const { getByTestId } = renderOnSettings();

    await waitFor(() => {
      expect(getByTestId('slug')).toHaveTextContent('clear');
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LAST_WORKSPACE_STORAGE_KEY)).toBe('clear');
  });

  it('redirects out when the default workspace itself is not reachable', async () => {
    answerBySlug(['clear']);

    renderOnSettings();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });
});
