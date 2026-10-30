# Test environment (staging)

A separate copy of the system with **fake data only**, for trying new features before they reach
`system.cleansense.co`. It never touches the real database.

## On this PC (ready now)

| What | Where |
|---|---|
| Database | Local MariaDB on `127.0.0.1:3308`, database `cleansense_staging` (data folder `D:\dev\mariadb-staging`) |
| Private settings | `D:\dev\staging.env`, outside the project: database address, owner login, session secret |
| System | `http://localhost:3100` |
| Daily and weekly backups | `D:\dev\staging-backups` |

**Start the database:**

```powershell
& 'D:\dev\mariadb-11.4.4-winx64\bin\mariadbd.exe' --datadir=D:\dev\mariadb-staging --port=3308 --bind-address=127.0.0.1 --console
```

**Fill it with fake data:** run this once. It does nothing if the database already has users.

```powershell
node system/staging/seed.mjs
```

It needs `STAGING_DB_URL` from `D:\dev\staging.env`, and `STAGING_SECRETS=D:\dev\staging.env` so the owner password is saved there.

**Start the system:**

```powershell
./system/staging/start.ps1
```

**Run the tests on MySQL:** set `TEST_MYSQL_URL` from `D:\dev\staging.env`, then run `cd dashboard; npm test`. The tests use their own database, `cleansense_test`, which is emptied first.

### Safety

- `seed.mjs` and `start.ps1` refuse any database whose name does not contain `staging` or `test`.
- Every person and phone number in the fake data is made up. The numbers are `05000xxxxx`.

## On Hostinger (later, needs the owner)

A hosted copy that the team can open from their phones needs three things:

1. **A second database.** The owner creates it in hPanel. The name must contain `staging`.
2. **A second Node.js app.** It uses the same deploy package, with `STORE=mysql` and the staging `DATABASE_URL`.
3. **An address for it.** For example `staging.cleansense.co`, as one DNS record at Namecheap. This needs the owner's approval.
