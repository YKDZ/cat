import { spawn } from "node:child_process";

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required when connection components are configured`,
    );
  }
  return value;
};

const configureConnectionUrls = () => {
  const databaseComponents = [
    "CAT_DATABASE_HOST",
    "CAT_DATABASE_NAME",
    "CAT_DATABASE_PASSWORD",
    "CAT_DATABASE_USER",
  ];
  if (databaseComponents.some((name) => process.env[name] !== undefined)) {
    const url = new URL("postgresql://localhost");
    url.hostname = required("CAT_DATABASE_HOST");
    url.port = process.env.CAT_DATABASE_PORT ?? "5432";
    url.pathname = `/${required("CAT_DATABASE_NAME")}`;
    url.username = required("CAT_DATABASE_USER");
    url.password = required("CAT_DATABASE_PASSWORD");
    url.searchParams.set("schema", process.env.CAT_DATABASE_SCHEMA ?? "public");
    process.env.DATABASE_URL = url.toString();
  }

  const redisComponents = ["CAT_REDIS_HOST", "CAT_REDIS_PASSWORD"];
  if (redisComponents.some((name) => process.env[name] !== undefined)) {
    const url = new URL("redis://localhost");
    url.hostname = required("CAT_REDIS_HOST");
    url.port = process.env.CAT_REDIS_PORT ?? "6379";
    url.password = required("CAT_REDIS_PASSWORD");
    process.env.REDIS_URL = url.toString();
  }
};

configureConnectionUrls();
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("container-runner requires a command");
const child = spawn(command, args, { env: process.env, stdio: "inherit" });
child.once("error", (error) => {
  throw error;
});
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
