export async function generatorToList(generator) {
  const result = [];
  for await (const entry of generator) {
    result.push(entry);
  }
  return result;
}
