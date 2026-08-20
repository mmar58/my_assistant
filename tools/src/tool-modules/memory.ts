import { ToolModule } from '../registry.js';
import { getEmbedding, saveMemory, searchMemories, getSetting } from '../db.js';

export const memoryTools: ToolModule[] = [
  {
    category: 'memory',
    definition: {
      type: 'function',
      function: {
        name: 'remember_info',
        description: 'Save important facts, preferences, or details into your long-term memory for future reference. Use this when the user asks you to remember something or when you learn an important fact that should persist across different chat sessions.',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The precise information to remember (e.g., "The user has a dog named Buster", "Preferred programming language is TypeScript"). Be descriptive.' }
          },
          required: ['content'],
        },
      },
    },
    execute: async (args, ctx) => {
      ctx.emit('status', `Saving memory: ${args.content}`);
      const embeddingModel = (await getSetting('embedding_model')) ?? process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';
      const embedding = await getEmbedding(args.content, embeddingModel);
      if (!embedding) {
        return { success: false, error: 'Failed to generate embedding for the memory content.' };
      }
      await saveMemory(args.content, embedding);
      return { success: true, message: 'Memory successfully saved.' };
    },
  },
  {
    category: 'memory',
    definition: {
      type: 'function',
      function: {
        name: 'recall_info',
        description: 'Search your long-term memory for past facts, preferences, or details using semantic similarity. Use this when you are asked about something you should know but cannot find in the immediate conversation history.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The question or concept to search your memory for (e.g., "What is the user\'s dog\'s name?", "user programming preferences")' }
          },
          required: ['query'],
        },
      },
    },
    execute: async (args, ctx) => {
      ctx.emit('status', `Searching memory for: ${args.query}`);
      const embeddingModel = (await getSetting('embedding_model')) ?? process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';
      const embedding = await getEmbedding(args.query, embeddingModel);
      if (!embedding) {
        return { success: false, error: 'Failed to generate embedding for the search query.' };
      }
      
      const memories = await searchMemories(embedding, 5);
      if (memories.length === 0) {
        return { success: true, memories: [], message: 'No relevant memories found.' };
      }
      
      return { 
        success: true, 
        memories: memories.map(m => m.content) 
      };
    },
  }
];
