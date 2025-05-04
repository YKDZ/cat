import { createClient } from "redis";

const main = createClient({
  url: process.env.REDIS_URL,
});

const pub = createClient({
  url: process.env.REDIS_URL,
});

const sub = createClient({
  url: process.env.REDIS_URL,
});

main.connect();
pub.connect();
sub.connect();

export const redis = main;
export const redisPub = pub;
export const redisSub = sub;
