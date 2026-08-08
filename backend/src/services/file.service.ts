import * as fs from 'fs';
import * as path from 'path';

const outputFile = path.join(process.cwd(), 'outputs.txt');

export const logResponse = (model: string, response: string) => {
  const timestamp = new Date().toISOString();
  const logEntry = `\n[${timestamp}] Model: ${model}\n${response}\n`;
  
  fs.appendFile(outputFile, logEntry, (err) => {
    if (err) {
      console.error('Error writing to outputs.txt:', err);
    }
  });
};
