
import assert from 'node:assert/strict';
import ts from 'typescript';
/** Deliberately closed source grammar. New authored syntax requires review. */
export function compileUnlockPredicate(source){
 const tree=ts.createSourceFile('predicate.ts','const predicate = '+source+';',ts.ScriptTarget.Latest,true);
 assert.equal(tree.parseDiagnostics.length,0,'Malformed package predicate');
 const declaration=tree.statements[0];
 assert(ts.isVariableStatement(declaration)&&tree.statements.length===1);
 const arrow=declaration.declarationList.declarations[0].initializer;
 assert(ts.isArrowFunction(arrow)&&!ts.isBlock(arrow.body)&&arrow.parameters.length<=1,'Unsupported predicate function');
 const parameter=arrow.parameters[0];
 if(parameter)assert(ts.isIdentifier(parameter.name)&&!parameter.initializer&&!parameter.dotDotDotToken);
 const name=parameter?.name.text;
 const strip=node=>ts.isParenthesizedExpression(node)?strip(node.expression):node;
 const number=node=>{
  node=strip(node);
  if(ts.isNumericLiteral(node))return Number(node.text);
  if(ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.MinusToken&&ts.isNumericLiteral(node.operand))return -Number(node.operand.text);
  assert.fail('Expected literal finite number');
 };
 const access=node=>{
  node=strip(node);
  if(ts.isPropertyAccessExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&
   ts.isIdentifier(node.expression.expression)&&node.expression.expression.text===name){
   if(node.expression.name.text==='ledger')return {source:'ledger',key:node.name.text};
   if(node.expression.name.text==='account'&&node.name.text==='level')return {source:'accountLevel'};
  }
  assert.fail('Unsupported predicate observation');
 };
 const visit=input=>{
  const node=strip(input);
  if(node.kind===ts.SyntaxKind.TrueKeyword||node.kind===ts.SyntaxKind.FalseKeyword)return {kind:'constant',value:node.kind===ts.SyntaxKind.TrueKeyword};
  assert(ts.isBinaryExpression(node),'Expected predicate expression');
  const operator=node.operatorToken.kind;
  if(operator===ts.SyntaxKind.BarBarToken||operator===ts.SyntaxKind.AmpersandAmpersandToken)
   return {kind:operator===ts.SyntaxKind.BarBarToken?'any':'all',terms:[visit(node.left),visit(node.right)]};
  assert(operator===ts.SyntaxKind.GreaterThanEqualsToken||operator===ts.SyntaxKind.GreaterThanToken,'Unsupported predicate comparison');
  const left=strip(node.left);let observed;
  if(ts.isBinaryExpression(left)&&left.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken){
   observed=access(left.left);assert.equal(observed.source,'ledger');observed.fallback=number(left.right);
  }else{observed=access(left);assert.equal(observed.source,'accountLevel','Ledger predicates must state a nullish fallback');}
  return {kind:'counter',...observed,comparison:operator===ts.SyntaxKind.GreaterThanEqualsToken?'>=':'>',threshold:number(node.right)};
 };
 return visit(arrow.body);
}
