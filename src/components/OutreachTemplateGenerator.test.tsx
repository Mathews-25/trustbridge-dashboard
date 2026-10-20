import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutreachTemplateGenerator } from "./OutreachTemplateGenerator";

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(() => Promise.resolve()),
  },
});

describe("OutreachTemplateGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render generator form", () => {
    render(<OutreachTemplateGenerator />);
    expect(screen.getByText("Outreach Template Generator")).toBeInTheDocument();
    expect(screen.getByLabelText("Template Format")).toBeInTheDocument();
    expect(screen.getByLabelText("Contributor Name (optional)")).toBeInTheDocument();
  });

  it("should generate email template", async () => {
    render(<OutreachTemplateGenerator waveNumber={2} />);

    const generateButton = screen.getByRole("button", {
      name: /Generate Template/i,
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/Wave 2 Payout Readiness Check/i)).toBeInTheDocument();
    });
  });

  it("should generate markdown template", async () => {
    render(<OutreachTemplateGenerator />);

    const formatSelect = screen.getByLabelText("Template Format") as HTMLSelectElement;
    fireEvent.change(formatSelect, { target: { value: "markdown" } });

    const generateButton = screen.getByRole("button", {
      name: /Generate Template/i,
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/# Wave 1 Payout Readiness/i)).toBeInTheDocument();
    });
  });

  it("should generate plain text template", async () => {
    render(<OutreachTemplateGenerator />);

    const formatSelect = screen.getByLabelText("Template Format") as HTMLSelectElement;
    fireEvent.change(formatSelect, { target: { value: "plain" } });

    const generateButton = screen.getByRole("button", {
      name: /Generate Template/i,
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/WAVE 1 PAYOUT READINESS CHECKLIST/i)).toBeInTheDocument();
    });
  });

  it("should use custom contributor name", async () => {
    render(<OutreachTemplateGenerator />);

    const nameInput = screen.getByLabelText("Contributor Name (optional)") as HTMLInputElement;
    await userEvent.type(nameInput, "Bob");

    const generateButton = screen.getByRole("button", {
      name: /Generate Template/i,
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/Dear Bob/i)).toBeInTheDocument();
    });
  });

  it("should use custom minimum XLM balance", async () => {
    render(<OutreachTemplateGenerator />);

    const xlmInput = screen.getByLabelText("Minimum XLM Balance") as HTMLInputElement;
    await userEvent.clear(xlmInput);
    await userEvent.type(xlmInput, "5");

    const generateButton = screen.getByRole("button", {
      name: /Generate Template/i,
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/5 XLM/)).toBeInTheDocument();
    });
  });

  it("should copy template to clipboard", async () => {
    render(<OutreachTemplateGenerator />);

    const generateButton = screen.getByRole("button", {
      name: /Generate Template/i,
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copy to Clipboard/i })).toBeInTheDocument();
    });

    const copyButton = screen.getByRole("button", {
      name: /Copy to Clipboard/i,
    });

    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it("should download template as file", async () => {
    const click = vi.fn();
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    const realCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string, options?: any) => {
        const el = realCreateElement(tagName, options);
        if (tagName.toLowerCase() === "a") {
          el.click = click;
        }
        return el;
      });

    try {
      render(<OutreachTemplateGenerator />);

      const generateButton = screen.getByRole("button", {
        name: /Generate Template/i,
      });

      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole("button", {
        name: /Download/i,
      });

      fireEvent.click(downloadButton);

      // File download triggered
      expect(createObjectURL).toHaveBeenCalled();
      expect(click).toHaveBeenCalled();
    } finally {
      createElementSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("should show copy confirmation message", async () => {
    render(<OutreachTemplateGenerator />);

    const generateButton = screen.getByRole("button", {
      name: /Generate Template/i,
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copy to Clipboard/i })).toBeInTheDocument();
    });

    const copyButton = screen.getByRole("button", {
      name: /Copy to Clipboard/i,
    });

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copied!/i })).toBeInTheDocument();
    });
  });

  it("should use custom wave number", async () => {
    render(<OutreachTemplateGenerator waveNumber={5} />);

    const generateButton = screen.getByRole("button", {
      name: /Generate Template/i,
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/Wave 5 Payout Readiness Check/i)).toBeInTheDocument();
    });
  });

  it("should use custom support email", async () => {
    render(<OutreachTemplateGenerator supportEmail="help@custom.com" />);

    const generateButton = screen.getByRole("button", {
      name: /Generate Template/i,
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/help@custom.com/)).toBeInTheDocument();
    });
  });
});
