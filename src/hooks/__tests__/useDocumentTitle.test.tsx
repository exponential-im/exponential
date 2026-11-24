import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DocumentTitleProvider, useDocumentTitle } from "../useDocumentTitle";

let pathname = "/w/clear/pages/abc";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

function Named({ title }: { title: string | undefined }) {
  useDocumentTitle(title);
  return null;
}

describe("DocumentTitleProvider", () => {
  afterEach(() => {
    cleanup();
    document.title = "App default";
    pathname = "/w/clear/pages/abc";
  });

  test("shows the section until the page names itself, with no product suffix", () => {
    const { rerender } = render(
      <DocumentTitleProvider>
        <Named title={undefined} />
      </DocumentTitleProvider>,
    );
    expect(document.title).toBe("Pages");

    rerender(
      <DocumentTitleProvider>
        <Named title="Engineering management" />
      </DocumentTitleProvider>,
    );
    expect(document.title).toBe("Engineering management");
  });

  test("falls back to the section when the named page unmounts", () => {
    const { rerender } = render(
      <DocumentTitleProvider>
        <Named title="Engineering management" />
      </DocumentTitleProvider>,
    );
    rerender(<DocumentTitleProvider>{null}</DocumentTitleProvider>);
    expect(document.title).toBe("Pages");
  });

  test("leaves a metadata-titled route's title alone", () => {
    pathname = "/docs/getting-started";
    document.title = "Getting started — Docs";
    render(<DocumentTitleProvider>{null}</DocumentTitleProvider>);
    expect(document.title).toBe("Getting started — Docs");
  });
});
