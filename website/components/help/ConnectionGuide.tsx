"use client";

import AnimatedDisclosure from "./AnimatedDisclosure";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Database,
  Laptop,
  LockKeyhole,
  Server,
} from "lucide-react";

function Command({ label, children }: { label: string; children: string }) {
  const [status, setStatus] = useState("");
  return (
    <div className="guide-command">
      <div>
        <span>{label}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(children);
              setStatus("Copied");
            } catch {
              setStatus("Select the command below to copy it manually.");
            }
          }}
          aria-label={`Copy ${label}`}
        >
          <Copy size={14} /> Copy
        </button>
      </div>
      <pre tabIndex={0}>
        <code>{children}</code>
      </pre>
      <span className="guide-copy-status" role="status">
        {status}
      </span>
    </div>
  );
}

const references = {
  remote:
    "https://mariadb.com/docs/server/mariadb-quickstart-guides/mariadb-remote-connection-guide",
  ssh: "https://man.openbsd.org/ssh",
  accounts:
    "https://mariadb.com/docs/server/reference/sql-statements/account-management-sql-statements/create-user",
  grants:
    "https://mariadb.com/docs/server/reference/sql-statements/account-management-sql-statements/grant",
  tls: "https://mariadb.com/docs/server/security/encryption/data-in-transit-encryption/secure-connections-overview",
};

export default function ConnectionGuide() {
  const [route, setRoute] = useState<"ssh" | "direct" | "hosted">("ssh");
  return (
    <div className="connection-guide">
      <div className="guide-intro">
        <span className="guide-eyebrow">CONNECTION FIELD GUIDE</span>
        <h1>
          Your server.
          <br />
          <em>Within reach.</em>
        </h1>
        <p>
          Connect Astral on your PC to a MariaDB or MySQL database on another
          machine.
        </p>
      </div>
      <div className="guide-callout">
        <LockKeyhole size={20} />
        <p>
          <strong>phpMyAdmin is a window into your database.</strong> Its web
          address is not a database endpoint. Seeing “localhost via UNIX socket”
          means phpMyAdmin connects inside the server. Your PC needs its own
          route. Remote connections require the Astral desktop app.
        </p>
      </div>
      <div className="guide-choices" aria-label="Choose your connection method">
        <button
          type="button"
          aria-pressed={route === "ssh"}
          onClick={() => setRoute("ssh")}
        >
          <LockKeyhole size={20} />
          <strong>SSH tunnel</strong>
          <span>Recommended · VPS / SSH access</span>
        </button>
        <button
          type="button"
          aria-pressed={route === "direct"}
          onClick={() => setRoute("direct")}
        >
          <Server size={20} />
          <strong>Direct connection</strong>
          <span>Server admin · IP allowlist + TLS</span>
        </button>
        <button
          type="button"
          aria-pressed={route === "hosted"}
          onClick={() => setRoute("hosted")}
        >
          <Database size={20} />
          <strong>Hosting provider</strong>
          <span>Only have a hosting panel?</span>
        </button>
      </div>
      <div
        className="guide-path"
        aria-label={
          route === "ssh"
            ? "Your PC connects through an encrypted SSH tunnel to MariaDB on the server"
            : "Your PC connects to your database through authorized remote access"
        }
      >
        <span>
          <Laptop size={25} />
          <strong>Your PC</strong>
          <small>Astral SQL</small>
        </span>
        <i>
          <ArrowRight size={18} />
        </i>
        <span>
          <LockKeyhole size={25} />
          <strong>{route === "ssh" ? "SSH tunnel" : "Protected access"}</strong>
          <small>
            {route === "ssh" ? "Encrypted connection" : "TLS + IP allowlist"}
          </small>
        </span>
        <i>
          <ArrowRight size={18} />
        </i>
        <span>
          <Database size={25} />
          <strong>Your server</strong>
          <small>MariaDB / MySQL</small>
        </span>
      </div>
      <div key={route} className="guide-route">
        {route === "ssh" && (
          <>
            <article className="guide-step">
              <span>01</span>
              <div>
                <h2>Prepare the database on your server</h2>
                <p>
                  This walkthrough assumes a Linux VPS running MariaDB and SSH
                  on the same machine. You need an SSH login and a separate
                  database login. Keep MariaDB listening on server loopback;
                  public port 3306 can stay closed.
                </p>
                <p>
                  Ask your database administrator to create a password account
                  for TCP loopback access. For MariaDB, run the following in an
                  administrator SQL console. Replace the password placeholder
                  locally with a unique password, and replace <code>FiveM</code>{" "}
                  if your database has another name.
                </p>
                <Command label="Server · MariaDB administrator SQL">
                  {
                    "CREATE USER 'astral_client'@'127.0.0.1'\n  IDENTIFIED BY 'REPLACE_WITH_A_UNIQUE_PASSWORD';\nGRANT SELECT ON `FiveM`.*\n  TO 'astral_client'@'127.0.0.1';"
                  }
                </Command>
                <p>
                  This starts with read access. Request only the write or schema
                  privileges you need. Do not reuse phpMyAdmin’s internal
                  service account. Verify the new login over TCP on the server;
                  a UNIX-socket login alone does not verify this route.
                </p>
                <Command label="Server · Linux terminal">
                  {
                    "mariadb --protocol=TCP --host=127.0.0.1 --port=3306 --user=astral_client --password FiveM"
                  }
                </Command>
                <p>
                  If access is denied, have the administrator check the account
                  host and authentication method. MySQL account matching may
                  differ. See{" "}
                  <a
                    href={references.accounts}
                    target="_blank"
                    rel="noreferrer"
                  >
                    MariaDB accounts
                  </a>{" "}
                  and{" "}
                  <a href={references.grants} target="_blank" rel="noreferrer">
                    database privileges
                  </a>
                  .
                </p>
              </div>
            </article>
            <article className="guide-step">
              <span>02</span>
              <div>
                <h2>Open your private tunnel</h2>
                <p>
                  On your Windows PC, open PowerShell. Replace{" "}
                  <code>SSH_USER</code> with your server login and{" "}
                  <code>SERVER_HOST</code> with its IP or hostname. These are
                  SSH details, not your phpMyAdmin login.
                </p>
                <Command label="Your PC · PowerShell">
                  {
                    "ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 127.0.0.1:13306:127.0.0.1:3306 SSH_USER@SERVER_HOST"
                  }
                </Command>
                <p>
                  Verify the server fingerprint with your host before accepting
                  it. Authenticate when prompted and leave this window open; a
                  quiet terminal is normal. If your host uses another SSH port,
                  add <code>-p SSH_PORT</code>. If <code>ssh</code> is missing,
                  install OpenSSH Client through Windows Optional Features.{" "}
                  <a href={references.ssh} target="_blank" rel="noreferrer">
                    OpenSSH forwarding reference
                  </a>
                  .
                </p>
              </div>
            </article>
            <article className="guide-step">
              <span>03</span>
              <div>
                <h2>Connect in Astral</h2>
                <ConnectionFields tunnel />
                <p>
                  Choose <strong>Test connection</strong>, then connect. For
                  this specific tunnel, both unencrypted database hops stay on
                  loopback; SSH encrypts traffic between the machines. Use TLS
                  if your server requires it. A separate database host behind
                  the SSH server needs TLS on that additional hop.
                </p>
                <p>
                  Keep the tunnel running during your session. Close it with
                  Ctrl+C when finished. Astral does not start or maintain SSH
                  tunnels automatically.
                </p>
              </div>
            </article>
          </>
        )}
        {route === "direct" && (
          <>
            <article className="guide-step">
              <span>01</span>
              <div>
                <h2>Enable a specific server interface</h2>
                <p>
                  These examples target a Debian / Ubuntu MariaDB server you
                  administer. Back up its configuration before editing. Locate
                  the loaded configuration with:
                </p>
                <Command label="Server · Linux terminal">
                  {"mariadbd --help --verbose"}
                </Command>
                <p>
                  In the active <code>[mysqld]</code> group, set{" "}
                  <code>bind-address</code> to the server’s LAN or
                  network-interface IP and ensure <code>skip-networking</code>{" "}
                  is disabled. The address must belong to the server; a public
                  NAT address might not. Preserve loopback binding if other
                  services need it. MariaDB 10.11+ supports multiple addresses.
                </p>
                <Command label="Server · MariaDB configuration example">
                  {
                    "[mysqld]\nbind-address = 127.0.0.1,SERVER_INTERFACE_IP\nskip-networking = 0"
                  }
                </Command>
                <p>
                  Replace the placeholder before saving. Plan a short
                  interruption, restart MariaDB, and confirm its listener.
                  Restore the backup if restart fails.
                </p>
                <Command label="Server · Linux terminal">
                  {
                    "sudo systemctl restart mariadb\nsudo systemctl status mariadb --no-pager\nsudo ss -ltnp '( sport = :3306 )'"
                  }
                </Command>
                <a href={references.remote} target="_blank" rel="noreferrer">
                  MariaDB remote access reference <ArrowRight size={13} />
                </a>
              </div>
            </article>
            <article className="guide-step">
              <span>02</span>
              <div>
                <h2>Allow your PC and require encryption</h2>
                <p>
                  Allow TCP 3306 from your PC’s public egress IP only, in both
                  the hosting firewall and the server firewall. On a LAN use
                  your PC’s LAN IP. Do not use an “anywhere” rule. If UFW is
                  already your active firewall:
                </p>
                <Command label="Server · UFW rule (replace CLIENT_IP)">
                  {"sudo ufw allow from CLIENT_IP to any port 3306 proto tcp"}
                </Command>
                <p>
                  Have your administrator configure a TLS certificate trusted by
                  your PC and valid for the database hostname. Astral currently
                  has no custom CA file picker; use a certificate chain its
                  trust store accepts, or the SSH route.{" "}
                  <a href={references.tls} target="_blank" rel="noreferrer">
                    MariaDB TLS setup
                  </a>
                  .
                </p>
                <Command label="Server · MariaDB administrator SQL">
                  {
                    "CREATE USER 'astral_client'@'CLIENT_IP'\n  IDENTIFIED BY 'REPLACE_WITH_A_UNIQUE_PASSWORD' REQUIRE SSL;\nGRANT SELECT ON `FiveM`.* TO 'astral_client'@'CLIENT_IP';"
                  }
                </Command>
                <p>
                  Replace all placeholders before running. Add permissions only
                  as needed. A changing client IP needs an updated allowlist and
                  account host. Use a VPN or SSH tunnel if your network makes
                  this impractical.
                </p>
              </div>
            </article>
            <article className="guide-step">
              <span>03</span>
              <div>
                <h2>Test from your other PC</h2>
                <Command label="Your PC · PowerShell">
                  {"Test-NetConnection -ComputerName DB_HOST -Port 3306"}
                </Command>
                <p>
                  Replace <code>DB_HOST</code> with the database endpoint. A
                  successful TCP test checks reachability only; Astral’s test
                  also checks TLS and login.
                </p>
                <ConnectionFields />
                <p>
                  When removing access, delete the specific firewall rule and
                  database account, then restore the previous listener
                  configuration if no other remote clients need it.
                </p>
              </div>
            </article>
          </>
        )}
        {route === "hosted" && (
          <article className="guide-step">
            <span>01</span>
            <div>
              <h2>Request remote database access</h2>
              <p>
                If you only have phpMyAdmin or a hosting panel, your provider
                controls the listener and firewall. Look for “Remote MySQL” or
                “Allowed IPs” in the panel, or send this request to support:
              </p>
              <Command label="Message template · hosting support">
                {
                  "I want to connect Astral SQL desktop to my database from another PC. Please provide the database hostname, TCP port, TLS requirements, and a database user limited to my database. Can you allowlist my client IP, or provide SSH tunnel access if direct connections are unavailable?"
                }
              </Command>
              <p>
                Send your client IP through your provider’s support channel.
                Enter database passwords only in Astral or your trusted
                administration tool. If neither remote access nor SSH is
                offered, export a SQL file from phpMyAdmin and open it in
                Astral’s editor; MySQL dumps are not automatically converted
                into SQLite databases.
              </p>
              <ConnectionFields />
            </div>
          </article>
        )}
      </div>
      <section className="guide-troubleshooting" id="troubleshooting">
        <span className="guide-eyebrow">WHEN A CONNECTION FAILS</span>
        <h2>Let the error point the way.</h2>
        {[
          [
            "Connection refused",
            "The endpoint rejected TCP. Check its port, listener, firewall rejection, and whether your SSH tunnel is still running. This happens before a password can be checked.",
          ],
          [
            "Connection timed out",
            "Packets may be dropped, the address may be wrong, or routing may be unavailable. Check both firewalls and the provider’s IP allowlist.",
          ],
          [
            "Access denied",
            "The server responded. Check the database username, password, authentication method, and allowed client host. SSH credentials and database credentials are separate.",
          ],
          [
            "TLS / certificate error",
            "Use the hostname on the certificate and a trusted certificate chain. Keep certificate verification enabled for direct remote access.",
          ],
          [
            "Unknown database",
            "Check the exact database name and case. FiveM and fivem can be different names.",
          ],
        ].map(([title, body]) => (
          <AnimatedDisclosure key={title} title={title}><p>{body}</p></AnimatedDisclosure>
        ))}
      </section>
      <div className="guide-finish">
        <Check size={18} />
        <p>
          After connecting, run <code>SELECT 1;</code> in Astral. A successful
          result confirms that your SQL session works.
        </p>
      </div>
    </div>
  );
}

function ConnectionFields({ tunnel = false }: { tunnel?: boolean }) {
  return (
    <dl className="guide-fields">
      {[
        ["Engine", "MariaDB (or MySQL for a MySQL server)"],
        [
          "Server host",
          tunnel
            ? "127.0.0.1"
            : "Database hostname supplied by your administrator",
        ],
        ["Port", tunnel ? "13306" : "3306, unless your host specifies another"],
        ["Database", "FiveM — replace with your database name"],
        ["Username", "astral_client — your database account"],
        ["Password", "The database password you created"],
        [
          "TLS mode",
          tunnel
            ? "Disabled only for the same-server SSH tunnel above"
            : "Verify server certificate and hostname",
        ],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
