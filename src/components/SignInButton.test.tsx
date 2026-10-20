import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSignIn = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

import { SignInButton } from "@/components/SignInButton";

describe("SignInButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the supplied children as its accessible name", () => {
    render(<SignInButton>Sign in with GitHub</SignInButton>);

    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeInTheDocument();
  });

  it("is enabled for signed-out users by default", () => {
    render(<SignInButton>Continue with GitHub</SignInButton>);

    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toHaveAttribute(
      "type",
      "button"
    );
  });

  it("calls GitHub signIn with the default callback URL", async () => {
    render(<SignInButton>Sign in</SignInButton>);

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mockSignIn).toHaveBeenCalledWith("github", { callbackUrl: "/register" });
  });

  it("uses a custom callback URL when provided", async () => {
    render(<SignInButton callbackUrl="/dashboard">Sign in</SignInButton>);

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mockSignIn).toHaveBeenCalledWith("github", { callbackUrl: "/dashboard" });
  });

  it("does not call the auth provider when disabled", async () => {
    render(<SignInButton disabled>Loading…</SignInButton>);

    const button = screen.getByRole("button", { name: "Loading…" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("forwards button props while replacing the click handler", async () => {
    const onClick = vi.fn();
    render(
      <SignInButton className="w-full" aria-label="GitHub authentication" onClick={onClick}>
        Sign in
      </SignInButton>
    );

    const button = screen.getByRole("button", { name: "GitHub authentication" });
    expect(button).toHaveClass("w-full");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(mockSignIn).toHaveBeenCalledOnce();
  });
});
