export const summarizeError = (error: unknown): unknown => {
  if (error instanceof Error) {
    const errObj: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    // Copy enumerable properties
    Object.assign(errObj, error);

    if (typeof errObj.message === "string" && errObj.message.length > 1000) {
      errObj.message = `${errObj.message.slice(0, 1000)}... (truncated)`;
    }

    if (typeof errObj.stack === "string" && errObj.stack.length > 2000) {
      errObj.stack = `${errObj.stack.slice(0, 2000)}... (truncated)`;
    }

    return errObj;
  }
  return error;
};
