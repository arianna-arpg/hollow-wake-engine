import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// A linker can verify named ports while missing calls hidden inside closures.
// Inspect those calls independently. This inventory is not execution evidence.
export function inspectCombatOwner(root, owner) {
  const uses = new Map();
  const directory = path.join(root, 'adapters/embedded');
  const files=fs.readdirSync(directory).filter(f=>/^combat-.*\.mjs$/.test(f)).map(f=>path.join(directory,f));
  const program=ts.createProgram(files,{allowJs:true,noResolve:true,target:ts.ScriptTarget.Latest}),checker=program.getTypeChecker();
  function ownerBinding(node,seen=new Set()) {
    const symbol=checker.getSymbolAtLocation(node);if(!symbol||seen.has(symbol))return false;seen.add(symbol);
    return symbol.declarations?.some(d=>{
      if(ts.isParameter(d)&&ts.isIdentifier(d.name)){
        // Adapter factories/constructors and the admission callback receive the
        // owner. Frame-local wedge parameters named `w` do not.
        return d.name.text==='world'||d.name.text==='w'&&(ts.isFunctionDeclaration(d.parent)||ts.isConstructorDeclaration(d.parent)
          ||ts.isArrowFunction(d.parent)&&ts.isPropertyAssignment(d.parent.parent)&&d.parent.parent.name.getText()==='admit');
      }
      if(ts.isBindingElement(d))return ts.isIdentifier(d.name)&&d.name.text==='w';
      if(!ts.isVariableDeclaration(d)||!d.initializer)return false;
      if(ts.isIdentifier(d.initializer))return ownerBinding(d.initializer,seen);
      return ts.isObjectLiteralExpression(d.initializer)&&ts.isIdentifier(d.name)&&['w','world'].includes(d.name.text);
    })??false;
  }
  function access(node) {
    if (ts.isIdentifier(node)) return ownerBinding(node) ? [] : undefined;
    if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword && node.name.text === 'w') return [];
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
      const parent = access(node.expression);
      return parent && [...parent, node.argumentExpression.text];
    }
    if (!ts.isPropertyAccessExpression(node)) return;
    const parent = access(node.expression);
    return parent && [...parent, node.name.text];
  }
  for (const filename of files) {
    const file=path.basename(filename),ast=program.getSourceFile(filename);
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const parts = access(node.expression);
        if (parts?.length && !['host', 'observers'].includes(parts[0])) {
          const key = parts.join('.');
          if (!uses.has(key)) uses.set(key, []);
          uses.get(key).push(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return [...uses].filter(([key]) => {
    let value = owner;
    for (const part of key.split('.')) value = value?.[part];
    return typeof value !== 'function';
  }).sort(([a], [b]) => a.localeCompare(b)).map(([call, sites]) => ({call, sites}));
}
