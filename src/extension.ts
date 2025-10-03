import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface Native {
    name: string;
    documentation: string;
    params: string;
    namespace: string;
}

let natives: Native[] = [];

export function activate(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = `$(rocket) Native Ready!`; // ícone + texto
    statusBarItem.tooltip = "visit my github😊 https://github.com/ny-makarov";
    statusBarItem.command = "fivem-stubs.showMessage"; // opcional: comando ao clicar
    statusBarItem.show();

    context.subscriptions.push(statusBarItem);

    // Registrar comando opcional
    const disposable = vscode.commands.registerCommand("fivem-stubs.showMessage", () => {
        vscode.window.showInformationMessage(`${natives.length} Natives Loaded!`);
    });

    context.subscriptions.push(disposable);
    
    // Tentar múltiplos caminhos possíveis
    const possiblePaths = [
        path.join(context.extensionPath, 'stubs', 'natives'),
        path.join(path.dirname(context.extensionPath), 'stubs', 'natives'),
        path.join(context.extensionPath, '..', 'stubs', 'natives'),
        path.join(path.dirname(context.extensionPath), 'fivem_lua_stubs-master', 'stubs', 'natives'),
        path.join(context.extensionPath, '..', 'fivem_lua_stubs-master', 'stubs', 'natives')
    ];
    
    let stubsPath = '';
    for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
            stubsPath = testPath;
            break;
        }
    }
    
    // Verificar se o diretório existe
    if (!stubsPath) {
        vscode.window.showErrorMessage(
            `Diretório de stubs não encontrado. Tentados:\n${possiblePaths.join('\n')}`
        );
        return;
    }
    
    console.log(`Stubs encontrados em: ${stubsPath}`);

    // Carregar os stubs
    try {
        loadNatives(stubsPath);
        vscode.window.showInformationMessage(`${natives.length} Natives Loaded!`);
    } catch (error) {
        vscode.window.showErrorMessage(`Erro ao carregar stubs: ${error}`);
        return;
    }

    // Registrar o provider de autocomplete
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'lua',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const linePrefix = document.lineAt(position).text.substr(0, position.character);
                
                return natives.map(native => {
                    const item = new vscode.CompletionItem(
                        native.name,
                        vscode.CompletionItemKind.Function
                    );
                    
                    // Documentação formatada
                    const markdown = new vscode.MarkdownString();
                    markdown.appendCodeblock(`${native.name}(${native.params})`, 'lua');
                    if (native.namespace) {
                        markdown.appendText(`\n[Library]: ${native.namespace}\n\n`);
                    }
                    if (native.documentation) {
                        markdown.appendMarkdown(native.documentation);
                    }
                    
                    item.documentation = markdown;
                    item.detail = `FiveM Native Helper - ${native.namespace}`;
                    item.insertText = new vscode.SnippetString(`${native.name}($1)$0`);
                    
                    return item;
                });
            }
        },
        '.' // Trigger character
    );

    // Registrar hover provider
    const hoverProvider = vscode.languages.registerHoverProvider('lua', {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            const word = document.getText(range);
            
            const native = natives.find(n => n.name === word);
            if (native) {
                const markdown = new vscode.MarkdownString();
                markdown.appendCodeblock(`${native.name}(${native.params})`, 'lua');
                if (native.namespace) {
                    markdown.appendText(`\n[Library]: ${native.namespace}\n\n`);
                }
                markdown.appendMarkdown(native.documentation || 'FiveM Native Function');
                
                return new vscode.Hover(markdown);
            }
        }
    });

    context.subscriptions.push(completionProvider, hoverProvider);
    
    // Configurar Lua Language Server para reconhecer os stubs
    configureLuaLanguageServer(stubsPath);
}

function configureLuaLanguageServer(stubsPath: string) {
    const config = vscode.workspace.getConfiguration('Lua');
    
    // Pegar o caminho da pasta stubs (um nível acima de natives)
    const stubsRoot = path.dirname(stubsPath);
    
    // Obter configurações atuais
    const currentWorkspace = config.get<string[]>('workspace.library') || [];
    const currentRuntime = config.get<string[]>('runtime.path') || [];
    
    // Adicionar os stubs se ainda não estiverem
    if (!currentWorkspace.includes(stubsRoot)) {
        config.update('workspace.library', [...currentWorkspace, stubsRoot], 
            vscode.ConfigurationTarget.Workspace);
    }
    
    // Configurar diagnostics para ignorar globals indefinidos do FiveM
    // config.update('diagnostics.globals', ['exports'], 
    //     vscode.ConfigurationTarget.Workspace);
    
    console.log(`Lua Language Server configurado com stubs em: ${stubsRoot}`);
}

function loadNatives(stubsPath: string) {
    const files = fs.readdirSync(stubsPath);
    
    files.forEach(file => {
        if (!file.endsWith('.lua')) return;
        
        const filePath = path.join(stubsPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const namespace = path.basename(file, '.lua');
        
        // Regex melhorada para capturar funções e comentários
        const lines = content.split('\n');
        let currentDoc = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Capturar comentários de documentação
            if (line.startsWith('---')) {
                currentDoc += line.substring(3).trim() + '\n';
                continue;
            }
            
            // Capturar definições de função
            const funcMatch = line.match(/^function\s+(\w+)\((.*?)\)/);
            if (funcMatch) {
                natives.push({
                    name: funcMatch[1],
                    params: funcMatch[2],
                    documentation: currentDoc.trim(),
                    namespace: namespace
                });
                currentDoc = '';
            } else if (line && !line.startsWith('---')) {
                // Resetar documentação se não for comentário ou função
                currentDoc = '';
            }
        }
    });
}

export function deactivate() {
    natives = [];
}