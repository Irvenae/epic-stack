# Database

## Primary Instance

The way that LiteFS works is that it has a "primary instance" that is the only
instance that can write to the database. All other instances are "replicas" that
can only read from the database. This is a pretty common pattern for databases
and it's how Fly's Postgres service works as well.

The primary instance is determined by Fly's [consul](https://www.consul.io/)
service and can change over time. By default, all instances are allowed to be
primary instances. However, writes will be slower for people who are not
geographically close to the primary instance, so the Epic Stack has configured
consul to only allow instances in the primary region and it's recommended that
you choose a primary region that's closest to most of your users. This
configuration can be found in `other/litefs.yml`. The `PRIMARY_REGION` is
determined from the `primary_region` property in the `fly.toml` file.

When you initialize an Epic Stack app, it will ask you which region you wish to
deploy to and this will set the `primary_region` in the `fly.toml` file. It is
recommended that you deploy two instances in this region so you have zero
downtime deploys.

You can determine which instance is the primary instance by running the
following command:

```sh
fly status --app [YOUR_APP_NAME]
```

This will show you a table of all your instances and the primary instance will
have "ROLE" set to "primary".

To deploy more regions, you can run `fly scale count`. For example, if I wanted
to have two instances in `sjc` (my primary region) and one in `ams`, I would
run:

```sh
fly scale count 2 --region sjc
fly scale count 1 --region ams
```

## Connecting to your production database

The location of the sqlite database is kinda funny. The real location is in
`/data/litefs/dbs/sqlite.db`. However, during development you connect to it via
the fake filesystem managed by LiteFS so it can propagate any changes to your
database to all replicas.

So to connect to your database, you'll want to connect to it at
`/litefs/data/sqlite.db` in the deployed application. Because it is SQLite, you
cannot connect to it unless you're running a command-line session on the
machine. You can do this using `fly ssh console`. The Dockerfile simplifies this
further by adding a `database-cli` command. You can connect to the live database
by running `fly ssh console -C database-cli`.

To connect to the deployed database from your local machine using Drizzle
Studio, you can utilize Fly's `ssh` and `proxy` commands.

- Run in one terminal the command to start Drizzle Studio on your desired Fly
  app
  ```sh
  fly ssh console -C "npm run db:studio" --app [YOUR_APP_NAME]
  ```
- Run in a second terminal the command to proxy your local port 5556 to Drizzle
  Studio
  ```sh
  fly proxy 5556:5555 --app [YOUR_APP_NAME]
  ```

If you have multiple instances of your app running, and you'd like to make edits
to your database, you will need to run `db:studio` on the primary instance.

- Get a list of your app instances, the `ROLE` column will show which instance
  is `primary`
  ```sh
  fly status --app [YOUR_APP_NAME]
  ```
- Run the console command with the `-s` select flag
  ```sh
  fly ssh console -C "npm run db:studio" -s --app [YOUR_APP_NAME]
  ```
- Use your arrow keys to select the primary instance

> **Note**: You may want to add `--select` to the `fly ssh console` command to
> select the instance you want to connect to if you have multiple instances
> running. Otherwise you could connect to a non-primary instance. The easiest
> way to determine the primary instance (because it can change) is to run
> `fly status` and the row that has "ROLE" set to "primary" is the primary
> instance. Alternatively, you can open the deployed application and check the
> request headers. One of them will be `Fly-Primary-Instance` which will tell
> you the instance ID of the primary instance.

## Migrations

Thanks to Drizzle, we've got a great mechanism for handling database migrations.
Any migrations necessary are run (by the primary instance only) as part of the
deploy process. You can find this in the `other/litefs.yml` file.

We deploy to multiple instances at once and the way we deploy means we don't
have any downtime during deploys. However, to make this work, you do need to
make sure you can run two versions of your app at once. Specifically, you should
not deploy "breaking schema changes" to your app in a way that will break any
running instances. This is a pretty typical requirement for production
applications.

The basic idea is that you maintain support for any client that is currently
running. In Epic Stack apps that's normally just the currently running version
of the app. So you really only need to worry about "breaking schema changes"
whenever you deploy a new version, but you don't have to worry about avoiding
breaking schema changes for old versions of the app that are no longer running.

In practice, this means you should adopt a "widen then narrow" strategy for
schema migrations. This is a pretty common practice, but here's a simple example
of how this works (each step here is an individual deploy):

1. Widen app to consume A or B
2. Widen db to provide A and B and the app to write to both A and B
3. Narrow app to consume B and only write to B
4. Narrow db to provide B

So, let's say that today your app allows users to provide a "name" and you want
to change that to `firstName` and `lastName` instead. Here's how you'd do that
(again, each of these steps end in a deploy):

1. Widen app to consume `firstName` and `lastName` or `name`. So all new code
   that references the `firstName` and `lastName` fields should fallback to the
   `name` field and not error if the `firstName` and `lastName` fields don't
   exist yet, which it won't at this point.
2. Widen db to provide `firstName` and `lastName` and `name`. So the `name`
   field should be populated with the `firstName` and `lastName` fields. You can
   do this as part of the migration SQL script that you run. The easiest way to
   do this is to generate the migration script to add the fields and then modify
   the script to copy the existing data in the `name` field to the `firstName`
   field (maybe with the help of VSCode Copilot 😅).
3. Narrow app to consume `firstName` and `lastName` by only writing to those
   fields and removing the fallback to the `name` field.
4. Narrow db to provide `firstName` and `lastName` by removing the `name` field.
   So now you can remove the `name` field from the db schema.

By following this strategy, you can ensure zero downtime deploys and schema
migrations.

## Backups

### LiteFS Cloud Backups

LiteFS Cloud is a service offered by Fly.io for managing backup and restore
functionality.

This is the simplest method for backing up your database.

It offers the ability to restore your database to any point in time in the last
30 days, with 5 minute granularity.

Fly.io has some great documentation on how to set this up:

- [Pricing](https://fly.io/docs/about/pricing/#litefs-cloud)
- [LiteFS Cloud Setup](https://fly.io/docs/litefs/cloud-backups/)
- [Restoring DB with LiteFS Cloud](https://fly.io/docs/litefs/cloud-restore/)
- [Disaster Recovery with LiteFS Cloud](https://fly.io/docs/litefs/disaster-recovery/)

The following is a summary of the steps to set up LiteFS Cloud:

1. Create a LiteFS Cloud cluster in your Fly.io dashboard:
   https://fly.io/dashboard/personal/litefs
   - Take note of the auth token, you'll need it in the next step
1. Set the `LITEFS_CLOUD_TOKEN` to the token from your dashboard:
   ```sh
   fly secrets set LITEFS_CLOUD_TOKEN="LITEFS_CLOUD_TOKEN_HERE" --app [YOUR_APP_NAME]
   ```
1. You should now be able to restore backups from the LiteFS dashboard.

### Manual DB Backups

Manual DB backups can be taken/restored using `litefs` commands:

- `litefs export`: https://fly.io/docs/litefs/export/
- `litefs import`: https://fly.io/docs/litefs/import/

**Make sure to keep the backup in a secure location. Your DB backup will contain
user information and password hashes!**

You can manually create a backup for your database using the following steps:

1. SSH into your fly instance:
   ```sh
   fly ssh console --app [YOUR_APP_NAME]
   ```
1. Create a `backups` folder:
   ```sh
   mkdir /backups
   ```
1. Create a backup file using `litefs export`, and exit the console (it is
   recommended to name the exported file with the current date):
   ```sh
   litefs export -name sqlite.db /backups/backup-2023-10-10.db
   exit
   ```
1. Use sftp to download the backup file:
   ```sh
   fly ssh sftp get /backups/backup-2023-10-10.db --app [YOUR_APP_NAME]
   ```

You can now store this backup file wherever you like, such as an S3 bucket
(again, make sure it's a secure location!).

See the fly docs for more info: https://fly.io/docs/litefs/backup/

### Manual DB restoration

**WARNING - THIS OVERWRITES YOUR DATABASE, YOU CAN LOSE DATA!! TAKE ANOTHER
BACKUP OF THE CURRENT DATABASE BEFORE DOING THIS!!**

1. Establish an sftp session with the fly instance and upload the backup file to
   the server using `put`:
   ```sh
   fly ssh sftp shell --app [YOUR_APP_NAME]
   put backup-2023-10-10.db
   ```
1. Quit the sftp session with CTRL+C
1. SSH into the fly instance:
   ```sh
   fly ssh console --app [YOUR_APP_NAME]
   ```
1. Restore the database from the backup file using `litefs import`
   ```sh
   litefs import -name sqlite.db /backup-2023-10-10.db
   ```
1. Exit the ssh session
   ```sh
   exit
   ```

## Troubleshooting
