# Security policy

## Supported versions

Only the latest release of the Ecovacs integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-ecovacs](https://github.com/prohand/gladys-ecovacs/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove emails, passwords, tokens and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), the
Ecovacs cloud, the Ecovacs Home app and the robots' firmware.

## How the integration handles your account

- The Ecovacs password is stored by Gladys in a `secret` field. The integration
  sends only its MD5 fingerprint to Ecovacs, as the Ecovacs Home app does, and
  only over HTTPS.
- Session tokens live in memory only; nothing is written to disk.
- Logs never contain the password or the tokens; the email is masked.
- After Ecovacs refuses the credentials, the integration stops retrying until the
  configuration changes, so it cannot get the account locked.

## Good practices for users

- Use a unique password for your Ecovacs account.
- Keep Gladys and the integration up to date.
