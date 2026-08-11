import ollama from 'ollama';

async function run() {
  const stream = await ollama.chat({
    model: 'richardyoung/llama-3.2-3b-instruct-abliterated:latest', // The user's model
    messages: [{ role: 'user', content: 'What is the weather in San Francisco?' }],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather for a specific location.',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' }
            },
            required: ['location']
          }
        }
      }
    ],
    stream: true,
  });

  for await (const chunk of stream) {
    console.log(JSON.stringify(chunk.message));
  }
}

run().catch(console.error);
