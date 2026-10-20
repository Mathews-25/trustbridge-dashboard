"use client";

import { useEffect, useState } from "react";
import { Copy, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_TEMPLATE_LOCALE,
  DEFAULT_TEMPLATE_TIME_ZONE,
  generateTemplate,
  SUPPORTED_TEMPLATE_LOCALES,
  type TemplateFormat,
  type TemplateOptions,
} from "@/lib/outreach-templates";

interface OutreachTemplateGeneratorProps {
  waveNumber?: number;
  supportEmail?: string;
  assetCode?: string;
  assetIssuer?: string;
}

export function OutreachTemplateGenerator({
  waveNumber = 1,
  supportEmail = "support@trustbridge.dev",
  assetCode = "USDC",
  assetIssuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
}: OutreachTemplateGeneratorProps) {
  const [format, setFormat] = useState<TemplateFormat>("email");
  const [locale, setLocale] = useState<string>(DEFAULT_TEMPLATE_LOCALE);
  const [contributorName, setContributorName] = useState("");
  const [minXlmBalance, setMinXlmBalance] = useState("1");
  const [deadline, setDeadline] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [template, setTemplate] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    const options: TemplateOptions = {
      contributorName: contributorName || "Contributor",
      waveNumber,
      deadline: new Date(deadline),
      minXlmBalance: parseFloat(minXlmBalance) || 1,
      supportEmail,
      assetCode,
      assetIssuer,
      locale,
      // The date input hands back a calendar day; render it in UTC so the day
      // in the email is the day the maintainer picked, wherever it is read.
      timeZone: DEFAULT_TEMPLATE_TIME_ZONE,
    };

    const generated = generateTemplate(format, options);
    setTemplate(generated);
    setCopied(false);
  };

  // A stale preview is worse than no preview: after switching locale the old
  // text still looks plausible, so the maintainer copies the wrong dates.
  useEffect(() => {
    setTemplate("");
    setCopied(false);
  }, [locale, format]);

  const handleCopy = () => {
    navigator.clipboard.writeText(template).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const extension = format === "email" ? "txt" : format === "markdown" ? "md" : "txt";
    const filename = `wave-${waveNumber}-outreach-template.${extension}`;
    const blob = new Blob([template], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Outreach Template Generator</CardTitle>
          <CardDescription>
            Generate outreach templates for Wave {waveNumber} contributors with
            wallet setup instructions and proof guidelines.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="format">Template Format</Label>
              <select
                id="format"
                value={format}
                onChange={(e) => setFormat(e.target.value as TemplateFormat)}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="email">Email</option>
                <option value="markdown">Markdown</option>
                <option value="plain">Plain Text</option>
              </select>
            </div>

            <div>
              <Label htmlFor="template-locale">Language / Region</Label>
              <select
                id="template-locale"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                aria-describedby="template-locale-help"
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {SUPPORTED_TEMPLATE_LOCALES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p
                id="template-locale-help"
                className="mt-1 text-xs text-muted-foreground"
              >
                Formats the deadline and the XLM amount. The template wording
                stays in English.
              </p>
            </div>

            <div>
              <Label htmlFor="contributor-name">Contributor Name (optional)</Label>
              <Input
                id="contributor-name"
                type="text"
                placeholder="e.g., Alice"
                value={contributorName}
                onChange={(e) => setContributorName(e.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="min-xlm">Minimum XLM Balance</Label>
              <Input
                id="min-xlm"
                type="number"
                min="0.1"
                step="0.1"
                value={minXlmBalance}
                onChange={(e) => setMinXlmBalance(e.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="deadline">Deadline Date</Label>
              <Input
                id="deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>

          <Button onClick={handleGenerate} className="w-full md:w-auto">
            Generate Template
          </Button>

          {template && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-slate-50 p-4 dark:bg-slate-900">
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-sm">
                  {template}
                </pre>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopy}
                  className="flex-1"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {copied ? "Copied!" : "Copy to Clipboard"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownload}
                  className="flex-1"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
