const port = process.env.PORT || 3000;
const url = `http://127.0.0.1:${port}/_health/ready`;

const controller = new AbortController();
const timeout = setTimeout(() => {
  controller.abort();
}, 2000);

fetch(url, { signal: controller.signal })
  .then((res) => {
    clearTimeout(timeout);
    process.exit(res.ok ? 0 : 1);
  })
  .catch(() => {
    clearTimeout(timeout);
    process.exit(1);
  });

export {};
