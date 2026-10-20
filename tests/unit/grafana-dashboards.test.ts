import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const GRAFANA_DIR = path.resolve(__dirname, "../../docs/grafana");

// List of frozen Prometheus metric names exposed by TrustBridge
const FROZEN_PROMETHEUS_METRICS = [
  "trustbridge_contributors_total",
  "trustbridge_contributors_ready",
  "trustbridge_contributors_ready_percent",
  "trustbridge_contributors_by_status",
  "trustbridge_health_status",
  "trustbridge_health_db_latency_ms",
  "trustbridge_health_csv_stale_count",
  "trustbridge_health_csv_stale_percent",
  "trustbridge_audit_entries_recent_total",
  "trustbridge_audit_events_total",
  "trustbridge_config_rate_limit_max_requests",
  "trustbridge_config_rate_limit_window_ms",
  "trustbridge_config_circuit_breaker_failure_threshold",
  "trustbridge_config_circuit_breaker_recovery_ms",
  "trustbridge_config_stale_csv_max_age_ms",
  "trustbridge_config_soroban_contract_configured",
];

// Potential secret key patterns that should NEVER appear in Grafana JSON
const FORBIDDEN_SECRET_PATTERNS = [
  /GITHUB_CLIENT_SECRET/i,
  /NEXTAUTH_SECRET/i,
  /TOKEN_ENCRYPTION_KEY/i,
  /CRON_SECRET/i,
  /GITHUB_WEBHOOK_SECRET/i,
  /password\s*[:=]/i,
  /bearer\s+[a-zA-Z0-9_\-\.]{15,}/i,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

describe("Grafana Dashboard JSON Validations", () => {
  it("docs/grafana directory exists and contains dashboard JSON files", () => {
    expect(fs.existsSync(GRAFANA_DIR)).toBe(true);
    const files = fs.readdirSync(GRAFANA_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    expect(jsonFiles.length).toBeGreaterThanOrEqual(2);
    expect(jsonFiles).toContain("trustbridge-overview.json");
    expect(jsonFiles).toContain("trustbridge-json-api.json");
  });

  it("every JSON file in docs/grafana parses cleanly via JSON.parse", () => {
    const files = fs.readdirSync(GRAFANA_DIR).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const filePath = path.join(GRAFANA_DIR, file);
      const content = fs.readFileSync(filePath, "utf-8");

      expect(() => {
        const parsed = JSON.parse(content);
        expect(typeof parsed).toBe("object");
        expect(parsed).not.toBeNull();
      }).not.toThrow();
    }
  });

  it("trustbridge-overview.json adheres to standard Grafana dashboard schema", () => {
    const filePath = path.join(GRAFANA_DIR, "trustbridge-overview.json");
    const dashboard = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    expect(dashboard.title).toBe("TrustBridge / Operational Overview");
    expect(dashboard.uid).toBe("trustbridge-overview");
    expect(dashboard.schemaVersion).toBeGreaterThanOrEqual(30);
    expect(Array.isArray(dashboard.panels)).toBe(true);
    expect(dashboard.panels.length).toBeGreaterThanOrEqual(10);
    expect(dashboard.tags).toContain("trustbridge");
    expect(dashboard.tags).toContain("wave");
  });

  it("trustbridge-json-api.json adheres to standard Grafana dashboard schema", () => {
    const filePath = path.join(GRAFANA_DIR, "trustbridge-json-api.json");
    const dashboard = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    expect(dashboard.title).toBe("TrustBridge / Operational Overview (JSON API)");
    expect(dashboard.uid).toBe("trustbridge-json-api");
    expect(dashboard.schemaVersion).toBeGreaterThanOrEqual(30);
    expect(Array.isArray(dashboard.panels)).toBe(true);
    expect(dashboard.panels.length).toBeGreaterThanOrEqual(5);
  });

  it("no dashboard JSON files contain secrets, private keys, or credentials", () => {
    const files = fs.readdirSync(GRAFANA_DIR).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const filePath = path.join(GRAFANA_DIR, file);
      const rawText = fs.readFileSync(filePath, "utf-8");

      for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
        expect(pattern.test(rawText)).toBe(false);
      }
    }
  });

  it("trustbridge-overview.json only queries frozen Prometheus metric names", () => {
    const filePath = path.join(GRAFANA_DIR, "trustbridge-overview.json");
    const dashboard = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    const usedExpressions: string[] = [];
    for (const panel of dashboard.panels) {
      if (panel.targets) {
        for (const target of panel.targets) {
          if (target.expr) {
            usedExpressions.push(target.expr);
          }
        }
      }
    }

    expect(usedExpressions.length).toBeGreaterThanOrEqual(10);

    for (const expr of usedExpressions) {
      const metricName = expr.split("{")[0].trim();
      expect(FROZEN_PROMETHEUS_METRICS).toContain(metricName);
    }
  });

  it("docs/grafana/README.md documents all frozen metric names", () => {
    const readmePath = path.join(GRAFANA_DIR, "README.md");
    expect(fs.existsSync(readmePath)).toBe(true);
    const readmeText = fs.readFileSync(readmePath, "utf-8");

    for (const metric of FROZEN_PROMETHEUS_METRICS) {
      expect(readmeText).toContain(metric);
    }
  });

  it("DEPLOYMENT.md links to Grafana documentation and dashboards", () => {
    const deploymentPath = path.resolve(__dirname, "../../docs/DEPLOYMENT.md");
    const deploymentText = fs.readFileSync(deploymentPath, "utf-8");

    expect(deploymentText).toContain("docs/grafana/");
    expect(deploymentText).toContain("trustbridge-overview.json");
  });

  it("README.md includes Grafana dashboards in the documentation index", () => {
    const rootReadmePath = path.resolve(__dirname, "../../README.md");
    const rootReadmeText = fs.readFileSync(rootReadmePath, "utf-8");

    expect(rootReadmeText).toContain("./docs/grafana/README.md");
  });
});
