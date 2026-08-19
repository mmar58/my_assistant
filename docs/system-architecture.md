# My Assistant - System Architecture

This document provides a comprehensive overview of the **My Assistant** system architecture, focusing on how the different services interact, the tools registry, and how to extend the system with new capabilities.

## 🏗️ High-Level Architecture

The system is composed of three main applications running concurrently:

1. **Frontend (`/frontend`) - Port 5173**
   - **Stack**: SvelteKit, Tailwind CSS, shadcn-svelte.
   - **Role**: Provides the user interface for chatting with the AI, managing settings, and viewing available tools.

2. **Backend Service (`/backend`) - Port 3000**
   - **Stack**: Node.js, Fastify, Ollama.
   - **Role**: Serves as the primary API for the frontend. Handles chat sessions, communicates directly with the local LLM (via Ollama), and manages user settings.
   - **Key Feature**: Dynamically queries the Tools Service for relevant tools based on user prompts using semantic search (via `pgvector`).

3. **Tools Service (`/tools`) - Port 3001**
   - **Stack**: Node.js, Fastify.
   - **Role**: A sandboxed, dedicated execution environment for all AI tools. It isolates tool execution from the main chat backend for better security and modularity.
   - **Key Feature**: Maintains the registry of all built-in and dynamically generated tools, enforces permissions (whitelisted directories and commands), and handles the actual execution of tools.

---

## 🛠️ Tools Subsystem

The Tools subsystem is a core part of the application, designed to give the LLM safe and structured access to your local machine.

### Tool Types

Tools are divided into two main categories:

1. **Built-in Tools**: Hardcoded TypeScript modules residing in `tools/src/tool-modules/`. These handle fundamental operations:
   - `filesystem`: Reading, writing, moving, and listing files/directories.
   - `shell`: Executing safe bash/shell commands.
   - `web`: Fetching and scraping web pages.
   - `time`: Getting the current system time.
   - `search`: Semantic searching of tools.
   - `tool_builder`: A meta-tool that allows the AI to *write its own custom tools* dynamically.

2. **Dynamic AI-Created Tools**: Tools that the AI has written for itself. 
   - Stored in the PostgreSQL database in the `tools` table.
   - Contains the raw JavaScript execution code and the JSON schema.
   - Hot-registered into memory immediately upon creation.

### Tool Storage & Semantic Search

All tools (both built-in and dynamic) are synced to a **PostgreSQL database** using `pgvector`. 
When the LLM needs tools to accomplish a task, the Backend converts the user's prompt into an embedding vector (using Ollama) and performs a **cosine similarity search** against the tools database. This ensures the LLM is only given the tools relevant to the current conversation context, saving token limits and improving performance.

### Security & Permissions

Before any tool is executed, the Tools Service checks the `tool_permissions` table:
- **Policy**: Can be `auto_approve`, `ask`, or `deny`.
- **Whitelisted Directories**: (For filesystem tools) Ensures the AI can only modify files in specific allowed paths.
- **Whitelisted Commands**: (For shell tools) Ensures only specific prefixes (like `npm run *` or `git *`) can be run.

---

## 🚀 How to Create New Tools

You have two ways to add new tools to the assistant: dynamically (via chat) or manually (in the codebase).

### Method 1: Dynamically via the AI (Recommended)
You can simply ask the assistant in the chat: *"Create a tool that does X"*. 
The AI will use its `create_tool` capability to write the JavaScript code, generate the JSON schema, and hot-register it. The tool is saved in the database and is immediately available for use without restarting the servers.

### Method 2: Manually as a Built-in Tool
If you need a highly complex tool with external dependencies, you should add it directly to the source code:

1. **Create the Tool Module**:
   Create a new file in `tools/src/tool-modules/my_tool.ts`.
   
   ```typescript
   import { ToolModule } from '../registry.js';

   export const myToolModule: ToolModule[] = [
     {
       category: 'custom',
       definition: {
         type: 'function',
         function: {
           name: 'my_custom_tool',
           description: 'A detailed description so the AI knows when to use this tool.',
           parameters: {
             type: 'object',
             properties: {
               inputParameter: { type: 'string', description: 'What to process' }
             },
             required: ['inputParameter']
           }
         }
       },
       execute: async (args, ctx) => {
         // Optionally emit status updates to the UI
         ctx.emit('status', `Processing ${args.inputParameter}...`);
         
         // Implement your logic here
         const result = doSomething(args.inputParameter);
         
         return { success: true, data: result };
       }
     }
   ];
   ```

2. **Register the Tool**:
   Open `tools/src/server.ts` and import your new module.
   Add it to the `registerBuiltinTools` array in the `start()` function:
   
   ```typescript
   import { myToolModule } from './tool-modules/my_tool.js';

   // Inside start()...
   await registerBuiltinTools([
     ...filesystemTools,
     ...shellTools,
     // ... other tools
     ...myToolModule,
   ]);
   ```

3. **Restart the Tools Service**:
   The `pnpm dev` watcher should automatically restart the server. Your new tool will be synced to the database, vectorized, and made instantly available to the LLM.
