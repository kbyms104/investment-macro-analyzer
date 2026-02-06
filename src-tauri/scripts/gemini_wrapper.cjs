const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Usage: node gemini_wrapper.cjs <model> <prompt_file_path>

const model = process.argv[2];
const promptFile = process.argv[3];

if (!model || !promptFile) {
    console.error('Usage: node gemini_wrapper.cjs <model> <prompt_file_path>');
    process.exit(1);
}

// Read prompt from file
let promptContent;
try {
    promptContent = fs.readFileSync(promptFile, 'utf8');
} catch (err) {
    console.error(`Failed to read prompt file: ${err.message}`);
    process.exit(1);
}

// Create a temp directory for execution to isolate from project files
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-wrapper-'));

// Prepare environment - remove GIT_DIR and other potential conflicting vars
const env = { ...process.env };
delete env.GIT_DIR;
delete env.GEMINI_ROOT;
delete env.INIT_CWD; // npm/yarn sets this, might confuse CLI

// Command to run: gemini -p "prompt" -m model -o text --yolo
// We pass prompt as argument to -p, not stdin, to be explicit.
// But wait, user prompt can be huge. Stdin is safer for huge content.
// "cat file | gemini -m model -o text --yolo" pattern is what we want.

const cmd = process.platform === 'win32' ? 'gemini.cmd' : 'gemini';

// Spawn Gemini CLI
// We pipe input to stdin to avoid command line length limits
const child = spawn(cmd, ['-m', model, '-o', 'text', '--yolo'], {
    cwd: tempDir, // Run in temp dir!
    env: env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true // Required for Windows .cmd execution
});

// Write prompt to stdin
child.stdin.write(promptContent);
child.stdin.end();

// Collect output
let stdout = '';
let stderr = '';

child.stdout.on('data', (data) => {
    stdout += data.toString();
});

child.stderr.on('data', (data) => {
    stderr += data.toString();
});

child.on('close', (code) => {
    // Cleanup temp dir
    try {
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
        // ignore cleanup errors
    }

    if (code === 0) {
        // Success - print only stdout
        console.log(stdout.trim());
        process.exit(0);
    } else {
        // Failure - print error info
        console.error(`Gemini CLI exited with code ${code}`);
        console.error(stderr);
        console.error(stdout); // Sometimes error info is in stdout
        process.exit(code);
    }
});

child.on('error', (err) => {
    try {
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) { }

    console.error(`Failed to start Gemini CLI: ${err.message}`);
    process.exit(1);
});
