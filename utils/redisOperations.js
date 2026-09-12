import crypto from "node:crypto";
import { redisClient } from "../config/redis.js";
import { env } from "../config/env.js";

const RESERVE_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local amount = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local ttl = redis.call("TTL", KEYS[1])
if current + amount > limit then
  return {0, current, ttl}
end
redis.call("SET", KEYS[1], current + amount)
if ttl < 0 then redis.call("EXPIRE", KEYS[1], ARGV[3]) end
return {1, current + amount, ttl}
`;

const ADJUST_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local adjusted = math.max(0, current + tonumber(ARGV[1]))
redis.call("SET", KEYS[1], adjusted)
local ttl = redis.call("TTL", KEYS[1])
if ttl < 0 then redis.call("EXPIRE", KEYS[1], ARGV[2]) end
return adjusted
`;

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export const reserveTokenUsage = async (key, amount) => {
  const result = await redisClient.eval(RESERVE_SCRIPT, {
    keys: [key],
    arguments: [String(amount), String(env.TOKEN_LIMIT), String(env.TOKEN_WINDOW_SECONDS)],
  });
  return {
    allowed: Number(result[0]) === 1,
    tokenUsed: Number(result[1]),
    ttl: Number(result[2]),
  };
};

export const adjustTokenUsage = async (key, delta) => {
  return Number(await redisClient.eval(ADJUST_SCRIPT, {
    keys: [key],
    arguments: [String(delta), String(env.TOKEN_WINDOW_SECONDS)],
  }));
};

export const acquireLock = async (key, ttlSeconds) => {
  const value = crypto.randomUUID();
  const acquired = await redisClient.set(key, value, { NX: true, EX: ttlSeconds });
  return acquired ? { key, value } : null;
};

export const releaseLock = async (lock) => {
  if (!lock) return;
  await redisClient.eval(RELEASE_LOCK_SCRIPT, {
    keys: [lock.key],
    arguments: [lock.value],
  });
};
