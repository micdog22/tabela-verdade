# Tabela-Verdade

Monte a tabela-verdade de qualquer expressão lógica, descubra se ela é tautologia, contradição ou contingência, compare duas expressões e simplifique tudo passo a passo com Quine-McCluskey, mapa de Karnaugh e circuito com portas lógicas. Feito para quem está apanhando de Lógica Matemática, Matemática Discreta ou Sistemas Digitais.

**Acesse online:** https://micdog22.github.io/tabela-verdade/

## Recursos

- Leitor de expressões que aceita várias notações: `¬ ~ ! não` para negação, `∧ & e .` para conjunção, `∨ | ou +` para disjunção, `→ ->` para condicional, `↔ <->` para bicondicional e `⊕ xor` para ou exclusivo. Também entende `se p então q`, `p sse q`, o apóstrofo pós-fixo da eletrônica (`A'`) e a justaposição (`A'B` é `A' ∧ B`).
- Mensagens de erro em português que apontam a coluna do problema, com dicas para os tropeços comuns (como o `^`, que é ambíguo).
- Linha "Lida como", com os parênteses que a precedência colocou, para você conferir se a expressão foi entendida do jeito que você pensou.
- Tabela-verdade de até 10 variáveis (1024 linhas), com colunas intermediárias para cada subexpressão, valores V/F ou 1/0 e as duas ordens de linhas usadas nos livros.
- Classificação em tautologia, contradição ou contingência.
- Equivalência entre duas expressões, com contraexemplo quando não são equivalentes e o teste de implicação lógica nos dois sentidos.
- Formas normais canônicas: FND (soma de mintermos, `Σm`) e FNC (produto de maxtermos, `ΠM`).
- Simplificação por Quine-McCluskey mostrando cada etapa: agrupamento por número de 1s, combinações, implicantes primos, tabela de cobertura, essenciais e o método de Petrick para escolher a cobertura. Mostra todas as soluções mínimas quando há empate.
- Forma mínima em soma de produtos e em produto de somas, sempre conferida contra a expressão original em todas as linhas.
- Combinações irrelevantes (don't care), como os códigos 10 a 15 em BCD.
- Mapa de Karnaugh de 2 a 4 variáveis com os grupos destacados, inclusive os que atravessam as bordas e os quatro cantos, agrupando 1s ou 0s.
- Circuito com portas NÃO, E e OU desenhado em SVG a partir da forma mínima, com download.
- Exportação da tabela em CSV (separado por ponto e vírgula, abre direto no Excel em português) e link para compartilhar a expressão.
- Funciona no celular, tem tema claro e escuro, navegação por teclado e não precisa de internet depois de carregado.

## Como usar

Digite a expressão no campo principal. Tudo é recalculado enquanto você digita.

| Você digita | Lida como | Resultado |
|---|---|---|
| `p -> q` | `p → q` | contingência, FNC `¬p ∨ q` |
| `~(p & q) <-> ~p | ~q` | `¬(p ∧ q) ↔ (¬p ∨ ¬q)` | tautologia (De Morgan) |
| `se chove e venta então fico_em_casa` | `(chove ∧ venta) → fico_em_casa` | contingência |
| `p ou não p` | `p ∨ ¬p` | tautologia |
| `(A ∧ B) ∨ (¬A ∧ C) ∨ (B ∧ C)` | igual | mínima: `(¬A ∧ C) ∨ (A ∧ B)` |

Com a opção **Variáveis de uma letra** marcada, `A'B'C'D' + A'B'CD' + AB'C'D' + AB'CD'` vira `B'·D'`: são os quatro cantos do mapa de Karnaugh, que se juntam porque as bordas do mapa são vizinhas.

Na seção de equivalência, `p → q` e `q → p` (a recíproca) não são equivalentes, e o contraexemplo aparece na hora: com `p = F` e `q = V`, a primeira vale V e a segunda vale F.

O botão **Copiar link** gera um endereço que já abre com a expressão, por exemplo `https://micdog22.github.io/tabela-verdade/#e=p+-%3E+q`.

### Precedência

Da que liga mais forte para a mais fraca:

| Ordem | Operador | Símbolos |
|---|---|---|
| 1 | negação | `¬` `~` `!` `não` `nao` `'` (pós-fixo) |
| 2 | conjunção | `∧` `&` `&&` `e` `.` `·` `*` e a justaposição |
| 3 | ou exclusivo | `⊕` `⊻` `xor` |
| 4 | disjunção | `∨` `\|` `\|\|` `ou` `+` |
| 5 | condicional | `→` `->` `=>` `então` (com `se` opcional antes) |
| 6 | bicondicional | `↔` `<->` `<=>` `⇔` `≡` `sse` `se e somente se` |

O condicional associa à direita (`p → q → r` é `p → (q → r)`); os outros associam à esquerda. Constantes: `1`, `0`, `⊤`, `⊥`, `verdadeiro`, `falso`. Palavras-chave vão em minúsculas, então `E` maiúsculo continua livre para ser nome de variável. Alguns livros dão a mesma precedência para `∧` e `∨`; na dúvida, use parênteses.

## Como rodar localmente

Os módulos ES não carregam via `file://`, então sirva a pasta:

```bash
python3 -m http.server 8000
```

e abra http://localhost:8000.

## Testes

```bash
npm test
```

(ou `node --test`; não há dependências para instalar). Os testes cobrem o leitor e a precedência (incluindo 400 árvores aleatórias impressas e lidas de novo em três notações), tabelas, classificação, equivalências, formas canônicas, Quine-McCluskey em funções conhecidas dos livros, nas 256 funções de 3 variáveis comparadas com força bruta e em centenas de funções aleatórias com semente fixa (sempre conferindo que a forma mínima é igual à original), os grupos do mapa de Karnaugh e o circuito.

## Como funciona

### Do texto para a árvore

Primeiro um analisador léxico quebra o texto em tokens (`p`, `∧`, `(`...), já guardando a coluna de cada um para as mensagens de erro. Depois um analisador sintático de **escalada de precedência** (o método de Pratt) monta a árvore: ele lê um operando e, enquanto o próximo operador tiver precedência maior ou igual à mínima pedida, consome o operador e lê o operando da direita exigindo precedência maior (para associar à esquerda) ou igual (para associar à direita, caso do condicional). Quando dois operandos aparecem lado a lado sem operador, o analisador assume uma conjunção, como na álgebra booleana (`A'B`).

### A tabela inteira de uma vez

Com `n` variáveis há `2^n` linhas, e a linha `r` é o próprio número `r` em binário: com `p, q, r`, a linha 5 é `101`, ou seja, `p = V, q = F, r = V`. Em vez de avaliar a árvore linha por linha, cada nó vira uma coluna inteira (um vetor de bytes): a coluna de `p ∧ q` é a coluna de `p` "e" a coluna de `q`, posição a posição. Assim as colunas intermediárias saem de graça.

- **Tautologia**: a coluna final só tem 1. **Contradição**: só tem 0. **Contingência**: tem dos dois.
- **Equivalência**: A e B são equivalentes quando têm a mesma coluna, ou seja, quando `A ↔ B` é tautologia. A primeira linha em que elas diferem é o contraexemplo. A implica B quando não existe linha com A verdadeira e B falsa.

### Formas canônicas

Cada linha verdadeira gera um **mintermo**, a conjunção que só é verdadeira naquela linha (linha 5 = `101` dá `A ∧ ¬B ∧ C`). A disjunção de todos é a FND, escrita `Σm(...)`. Do mesmo jeito, cada linha falsa gera um **maxtermo**, a disjunção que só é falsa nela (`¬A ∨ B ∨ ¬C`), e a conjunção deles é a FNC, `ΠM(...)`.

### Quine-McCluskey

A ideia é aplicar sem parar a regra `x·y + x·y' = x`:

1. Cada mintermo (e cada irrelevância) é escrito em binário e agrupado pelo número de 1s.
2. Dois termos que diferem em um único bit se juntam, e esse bit vira um traço: `0101` com `0111` dá `01-1`. Só termos de grupos vizinhos podem diferir em um bit, por isso o agrupamento economiza comparações. O processo se repete com os novos termos (que precisam ter os traços nas mesmas posições) até nada mais combinar.
3. Os termos que nunca combinaram são os **implicantes primos**: não dá para tirar mais nenhuma variável deles sem cobrir um zero.
4. Na **tabela de cobertura**, se um mintermo é coberto por um único primo, esse primo é **essencial** e entra obrigatoriamente.
5. Para os mintermos que sobram, o **método de Petrick** escreve, para cada um, a soma dos primos que o cobrem e multiplica tudo: `P = (P1 + P2)(P1 + P3)(P2 + P3)`. Expandindo com a absorção (`X + XY = X`), cada produto que sobra é uma cobertura completa; escolhemos a de menos primos e, no empate, menos literais.

O problema de cobertura é NP-difícil, e a expansão de Petrick pode explodir em funções grandes (8 a 10 variáveis com muitos primos). Quando passa de 2000 produtos, a ferramenta troca para uma busca exata com poda (ramificação e limite) e avisa se precisou parar antes de provar que a resposta é mínima. A resposta continua correta, e a página confere a forma mínima contra a original em todas as linhas.

O **produto de somas** mínimo sai do mesmo método aplicado aos zeros: simplificamos o complemento `F'` e aplicamos De Morgan, trocando cada produto de `F'` por uma soma com os literais invertidos.

### Mapa de Karnaugh

O mapa é a tabela-verdade arrumada em código Gray (`00, 01, 11, 10`), em que vizinhos diferem em uma única variável, inclusive da última coluna para a primeira e da última linha para a primeira. Por isso um grupo retangular de 1, 2, 4 ou 8 células é exatamente um implicante: as variáveis que mudam dentro do grupo somem. Os grupos desenhados são os primos escolhidos por Quine-McCluskey; um grupo que atravessa a borda é desenhado em pedaços abertos nas laterais, e o dos quatro cantos vira quatro pedaços.

### Circuito

Cada variável desce por um trilho vertical, e quem aparece negada ganha um segundo trilho depois de uma porta NÃO. Cada produto vira uma porta E ligada aos trilhos dos seus literais, e uma porta OU junta os produtos. Termos de um literal só vão direto para a porta OU.

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT. Veja [LICENSE](LICENSE).
