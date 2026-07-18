"use client";

import { useState, useCallback, useMemo } from "react";
import { Copy, Check, Code, Monitor } from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import php from "highlight.js/lib/languages/php";
import rust from "highlight.js/lib/languages/rust";
import csharp from "highlight.js/lib/languages/csharp";
import javascript from "highlight.js/lib/languages/javascript";
import yaml from "highlight.js/lib/languages/yaml";

type Props = {
  host: string;
  port: number;
  user: string;
  password: string;
  dbName: string;
};

type Sample = {
  label: string;
  language: string;
  code: string;
  category?: string;
};

interface LanguageGroup {
  label: string;
  items: Sample[];
}

// ─── Language groups ──────────────────────────────────────────────────────────

const LANGUAGE_GROUPS: LanguageGroup[] = [
  {
    label: "Languages & Frameworks",
    items: [
      {
        label: "C# (.NET)",
        language: "csharp",
        code: `// Npgsql + MySqlConnector
var builder = new MySqlConnectionStringBuilder {
    Server = "{host}",
    Port = {port},
    UserID = "{user}",
    Password = "{password}",
    Database = "{dbName}",
    SslMode = MySqlSslMode.VerifyCA,
    CertificateFile = "ca-cert.pem",
    CertificatePassword = null,
};
using var conn = new MySqlConnection(builder.ConnectionString);
conn.Open();`,
      },
      {
        label: "Java (JDBC)",
        language: "java",
        code: `// Requires the MySQL Connector/J driver
// Download CA, client cert, and key from the SSL section above

String url = "jdbc:mysql://{host}:{port}/{dbName}" +
    "?requireSSL=true" +
    "&verifyServerCertificate=true" +
    "&clientCertificateKeyStoreUrl=file:client-keystore.p12" +
    "&clientCertificateKeyStorePassword=changeit" +
    "&trustCertificateKeyStoreUrl=file:truststore.p12" +
    "&trustCertificateKeyStorePassword=changeit";

// Convert PEM to PKCS12 keystore:
// openssl pkcs12 -export -in client-cert.pem -inkey client-key.pem \\
//   -certfile ca-cert.pem -out client-keystore.p12 -password pass:changeit
// keytool -importcert -file ca-cert.pem -keystore truststore.p12 \\
//   -storepass changeit -noprompt

Connection conn = DriverManager.getConnection(url, "{user}", "{password}");`,
      },
      {
        label: "TypeScript (Drizzle)",
        language: "typescript",
        code: `import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { readFileSync } from 'fs';

const pool = mysql.createPool({
  host: '{host}',
  port: {port},
  user: '{user}',
  password: '{password}',
  database: '{dbName}',
  ssl: {
    ca: readFileSync('ca-cert.pem'),
    cert: readFileSync('client-cert.pem'),
    key: readFileSync('client-key.pem'),
  },
});

const db = drizzle(pool);
// const users = await db.select().from(usersTable);`,
      },
      {
        label: "Node.js (mysql2)",
        language: "nodejs",
        code: `import mysql from 'mysql2/promise';
import fs from 'fs';

const connection = await mysql.createConnection({
  host: '{host}',
  port: {port},
  user: '{user}',
  password: '{password}',
  database: '{dbName}',
  ssl: {
    ca: fs.readFileSync('ca-cert.pem'),
    cert: fs.readFileSync('client-cert.pem'),
    key: fs.readFileSync('client-key.pem'),
  },
});
const [rows] = await connection.execute('SELECT 1');`,
      },
      {
        label: "PHP (Laravel)",
        language: "php-laravel",
        code: `// config/database.php
'mysql' => [
    'driver' => 'mysql',
    'host' => env('DB_HOST', '{host}'),
    'port' => env('DB_PORT', '{port}'),
    'database' => env('DB_DATABASE', '{dbName}'),
    'username' => env('DB_USERNAME', '{user}'),
    'password' => env('DB_PASSWORD', '{password}'),
    'options' => [
        PDO::MYSQL_ATTR_SSL_CA => storage_path('ca-cert.pem'),
        PDO::MYSQL_ATTR_SSL_CERT => storage_path('client-cert.pem'),
        PDO::MYSQL_ATTR_SSL_KEY => storage_path('client-key.pem'),
        PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => true,
    ],
],`,
      },
      {
        label: "PHP (PDO)",
        language: "php-pdo",
        code: `$pdo = new PDO(
    'mysql:host={host};port={port};dbname={dbName}',
    '{user}',
    '{password}',
    [
        PDO::MYSQL_ATTR_SSL_CA => 'ca-cert.pem',
        PDO::MYSQL_ATTR_SSL_CERT => 'client-cert.pem',
        PDO::MYSQL_ATTR_SSL_KEY => 'client-key.pem',
        PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => true,
    ]
);`,
      },
      {
        label: "Spring Boot (Java)",
        language: "spring-boot",
        code: `# application.yml
spring:
  datasource:
    url: jdbc:mysql://{host}:{port}/{dbName}?requireSSL=true&verifyServerCertificate=true
    username: {user}
    password: {password}
    driver-class-name: com.mysql.cj.jdbc.Driver

// With PEM certs via custom DataSource config:
// @Bean
// public DataSource dataSource() throws Exception {
//     HikariConfig config = new HikariConfig();
//     config.setJdbcUrl("jdbc:mysql://{host}:{port}/{dbName}?requireSSL=true");
//     config.setUsername("{user}");
//     config.setPassword("{password}");
//     config.setDriverClassName("com.mysql.cj.jdbc.Driver");
//     // Convert PEM to PKCS12 first
//     return new HikariDataSource(config);
// }`,
      },
      {
        label: "Go",
        language: "go",
        code: `import (
    "crypto/tls"
    "crypto/x509"
    "database/sql"
    "os"

    "github.com/go-sql-driver/mysql"
)

rootCertPool := x509.NewCertPool()
pem, _ := os.ReadFile("ca-cert.pem")
rootCertPool.AppendCertsFromPEM(pem)

clientCert, _ := tls.LoadX509KeyPair("client-cert.pem", "client-key.pem")

tlsConfig := &tls.Config{
    RootCAs:      rootCertPool,
    Certificates: []tls.Certificate{clientCert},
    ServerName:   "{host}",
}
mysql.RegisterTLSConfig("euroscale", tlsConfig)

db, _ := sql.Open("mysql", "{user}:{password}@tcp({host}:{port})/{dbName}?tls=euroscale")`,
      },
      {
        label: "Python (mysql-connector)",
        language: "python-connector",
        code: `import mysql.connector

conn = mysql.connector.connect(
    host="{host}",
    port={port},
    user="{user}",
    password="{password}",
    database="{dbName}",
    ssl_ca="ca-cert.pem",
    ssl_cert="client-cert.pem",
    ssl_key="client-key.pem",
    ssl_verify_cert=True,
)
cursor = conn.cursor()
cursor.execute("SELECT 1")`,
      },
      {
        label: "Python (SQLAlchemy)",
        language: "python-sqlalchemy",
        code: `from sqlalchemy import create_engine

engine = create_engine(
    "mysql+mysqlconnector://{user}:{password}@{host}:{port}/{dbName}",
    connect_args={
        "ssl_ca": "ca-cert.pem",
        "ssl_cert": "client-cert.pem",
        "ssl_key": "client-key.pem",
        "ssl_verify_cert": True,
    },
)`,
      },
      {
        label: "Ruby (Rails)",
        language: "ruby-rails",
        code: `# config/database.yml
production:
  adapter: mysql2
  host: {host}
  port: {port}
  database: {dbName}
  username: {user}
  password: {password}
  ssl_mode: verify_ca
  sslca: ca-cert.pem
  sslcert: client-cert.pem
  sslkey: client-key.pem`,
      },
      {
        label: "Rust (sqlx)",
        language: "rust",
        code: `use sqlx::mysql::MySqlConnectOptions;
use std::fs;

let opts = MySqlConnectOptions::new()
    .host("{host}")
    .port({port})
    .database("{dbName}")
    .username("{user}")
    .password("{password}")
    .ssl_ca("ca-cert.pem")
    .ssl_client_cert("client-cert.pem")
    .ssl_client_key("client-key.pem");

let pool = sqlx::MySqlPool::connect_with(opts).await?;`,
      },
    ],
  },
  {
    label: "GUI Client",
    items: [
      {
        label: "DBeaver",
        language: "dbeaver",
        code: `1. New Connection → MySQL
2. Main tab:
   - Host: {host}
   - Port: {port}
   - Database: {dbName}
   - User: {user}
   - Password: *****
3. SSL tab:
   - Use SSL: ✓
   - CA Certificate: [Download from above]
   - Client Certificate: [Download from above]
   - Client Key: [Download from above]
4. Test Connection → Finish`,
      },
    ],
  },
];

// Flatten groups into single array for tab display
const ALL_SAMPLES: Sample[] = LANGUAGE_GROUPS.flatMap((g) => g.items);

// Register highlight.js languages
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("java", java);
hljs.registerLanguage("go", go);
hljs.registerLanguage("python", python);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("php", php);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("yaml", yaml);

// Map our language labels to highlight.js language identifiers
const LANG_MAP: Record<string, string> = {
  csharp: "csharp",
  java: "java",
  typescript: "typescript",
  nodejs: "javascript",
  "php-laravel": "php",
  "php-pdo": "php",
  "spring-boot": "java",
  go: "go",
  "python-connector": "python",
  "python-sqlalchemy": "python",
  "ruby-rails": "ruby",
  rust: "rust",
  dbeaver: "plaintext",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConnectionSamples({
  host,
  port,
  user,
  password,
  dbName,
}: Props) {
  const [selected, setSelected] = useState("typescript");
  const [copiedLang, setCopiedLang] = useState<string | null>(null);

  const interpolate = useCallback(
    (template: string) =>
      template
        .replace(/\{host\}/g, host)
        .replace(/\{port\}/g, String(port))
        .replace(/\{user\}/g, user)
        .replace(/\{password\}/g, password)
        .replace(/\{dbName\}/g, dbName),
    [host, port, user, password, dbName],
  );

  const sample = ALL_SAMPLES.find((s) => s.language === selected);
  const rawCode = sample ? interpolate(sample.code) : "";
  const hlLang = sample ? (LANG_MAP[sample.language] || "plaintext") : "plaintext";

  const highlightedCode = useMemo(() => {
    if (!rawCode) return "";
    if (hlLang === "plaintext") return rawCode;
    try {
      return hljs.highlight(rawCode, { language: hlLang }).value;
    } catch {
      return rawCode;
    }
  }, [rawCode, hlLang]);

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(rawCode);
      setCopiedLang(selected);
      setTimeout(() => setCopiedLang(null), 2000);
    } catch {
      // silent fail
    }
  }, [rawCode, selected]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border-subtle px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Code size={16} className="text-accent-text" />
          <CardTitle className="text-sm font-semibold">
            How to Connect
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Tab buttons — scrollable row */}
        <div className="flex gap-1 px-4 py-2.5 overflow-x-auto border-b border-border-subtle">
          {ALL_SAMPLES.map((s) => {
            const isSelected = selected === s.language;
            return (
              <Button
                key={s.language}
                variant={isSelected ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setSelected(s.language)}
                className={cn(
                  "shrink-0 whitespace-nowrap",
                  s.category === "gui" && "border-l border-border-subtle pl-3 ml-1",
                )}
              >
                {s.category === "gui" && (
                  <Monitor size={11} className="mr-1 text-text-muted" />
                )}
                {s.label}
              </Button>
            );
          })}
        </div>

        {/* Code block */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-2 right-2 z-10"
            onClick={handleCopy}
            aria-label="Copy code"
          >
            {copiedLang === selected ? (
              <Check size={12} className="text-success" />
            ) : (
              <Copy size={12} />
            )}
          </Button>
          <pre className="p-4 pt-8 text-xs leading-relaxed overflow-x-auto bg-surface-2 font-mono whitespace-pre">
            <code
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
