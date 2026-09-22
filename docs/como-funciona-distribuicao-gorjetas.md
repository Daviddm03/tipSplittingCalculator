# Como funciona a distribuição de gorjetas

Este documento explica a implementação por dias trabalhados em `distribution.js`, `script.js`, `index.html` e `style.css`. Os trechos de JavaScript abaixo foram extraídos dos arquivos finais. É material de estudo desta funcionalidade.

## 1. Visão geral

O fluxo é: entrada → estado → validação → cálculo → distribuição dos cêntimos residuais → resultado → PDF.

O utilizador escolhe o período, informa as gorjetas, seleciona os colaboradores e preenche os dias efetivamente trabalhados. O sistema soma apenas os dias dos selecionados. Quem trabalhou o dobro dos dias tem direito ao dobro da quota, antes do ajuste necessário para pagar em cêntimos inteiros.

Cargo e outlet não entram na fórmula. `role` continua no cadastro para apresentação; `outlet` organiza a lista e identifica o colaborador no relatório. Férias e ausências são representadas por menos dias, sem regras adicionais.

Há uma pequena separação de responsabilidades: `distribution.js` contém funções puras de conversão, validação e distribuição. Não acessa o DOM e pode ser testado pelo Node. `script.js` continua responsável pelos eventos, pelo estado em memória, pelas telas e pelo jsPDF. O HTML carrega `distribution.js` antes de `script.js`. Não foi introduzido framework, banco de dados ou armazenamento persistente.

## 2. Estrutura dos dados

Existem três representações com propósitos diferentes. Não colocamos o pagamento no cadastro permanente.

Cadastro real do primeiro colaborador em `employees`:

```js
{
    id: 1,
    name: "David Montaño",
    role: "Barman de primeira",
    outlet: "Sky Bar"
}
```

Os 63 colaboradores receberam IDs numéricos explícitos. Os números estão escritos em cada registro, não são recalculados com a posição do array em cada execução. Mover um registro no código preserva seu ID. Os IDs devem continuar únicos.

Depois de selecionar David e digitar 20, este é o formato de seu rascunho em `selectedEmployees`:

```js
{
    id: 1,
    name: "David Montaño",
    role: "Barman de primeira",
    outlet: "Sky Bar",
    daysWorked: "20"
}
```

`daysWorked` no rascunho é texto. Isso permite distinguir `""` (ainda não informado), `"0"` (zero válido) e `"1.5"` (entrada inválida). Converter tudo imediatamente com `Number()` transformaria uma string vazia em zero e esconderia a ausência de informação.

No resultado de €100, com David trabalhando 20 dias e José trabalhando 10, David aparece em `calculationResult.payments` assim:

```js
{
    id: 1,
    name: "David Montaño",
    outlet: "Sky Bar",
    daysWorked: 20,
    amountCents: 6667
}
```

Agora os dias são um inteiro validado e o pagamento são 6667 cêntimos, isto é, €66,67. `amountCents` explicita a unidade; não existe uma propriedade monetária ambígua chamada `amount`. O cargo não é copiado para o resultado porque não participa da distribuição nem das colunas exigidas.

O resultado completo contém `period`, `totalTipsCents`, `totalWorkedDays`, `valuePerDayCents`, `employeeCount`, `payments` e `totalDistributedCents`. O campo `valuePerDayCents` é uma aproximação para apresentação. Os pagamentos são os valores definitivos.

## 3. Days Worked

`renderEmployees()` cria um checkbox nativo para cada colaborador e um campo separado para os dias. O checkbox fica dentro de um `label` que contém nome, cargo e outlet. Assim, clicar no nome seleciona e a tecla Espaço também funciona. O campo de dias não está dentro do label do checkbox: editar dias não desmarca a pessoa.

Trecho real da configuração do input:


```js
        input.type = 'text';
        input.inputMode = 'numeric';
        input.pattern = '[0-9]*';
        input.className = 'days-input';
        input.id = 'days-' + employee.id;
        input.autocomplete = 'off';
        input.value = selected?.daysWorked ?? '';
        input.disabled = !selected;
        input.required = true;
        input.setAttribute('aria-label', 'Days worked — ' + employee.name);
        input.setAttribute('aria-describedby', 'employee-error');
        input.setAttribute('aria-invalid', String(Boolean(selected) && parseDaysWorked(input.value) === null));
        input.addEventListener('input', () => {
            updateDaysWorked(employee.id, input.value);
            input.setAttribute('aria-invalid', String(parseDaysWorked(input.value) === null));
        });
```


`type="text"` preserva a escrita original; `inputMode="numeric"` sugere o teclado numérico em dispositivos móveis; `pattern` declara a forma esperada. Esses atributos não substituem a validação JavaScript. É possível colar texto inválido, que permanece visível para correção, mas nunca é aceito para calcular. Não truncamos `1.5` silenciosamente para `1`.

O ID do input é `days-` seguido do ID do colaborador. O nome acessível inclui o nome da pessoa, e `aria-describedby` associa o erro da seleção. O evento `input` captura cada alteração, inclusive por colagem:


```js
function updateDaysWorked(employeeId, value) {
    const employee = selectedEmployees.find(item => item.id === employeeId);
    if (!employee) return;
    employee.daysWorked = value;
    invalidateResult();
    employeeError.classList.remove('visible');
}
```


O `find` procura por ID. Se a pessoa já não está selecionada, o evento é ignorado. Caso contrário, o texto é armazenado no rascunho e qualquer resultado anterior é invalidado.


```js
function setEmployeeSelected(employee, selected) {
    const existing = selectedEmployees.find(item => item.id === employee.id);
    if (selected && !existing) selectedEmployees.push({ ...employee, daysWorked: '' });
    if (!selected) selectedEmployees = selectedEmployees.filter(item => item.id !== employee.id);
    invalidateResult();
    employeeError.classList.remove('visible');
    updateSelectedCount();
}
```


Ao selecionar, `{ ...employee, daysWorked: '' }` cria uma cópia com os dias em branco. O catálogo permanece intacto. Ao desmarcar, `filter` remove o registro inteiro do rascunho, incluindo seus dias. Selecionar novamente cria um campo em branco. `SELECT ALL` usa esta mesma função e afeta apenas o outlet visível; os demais selecionados e seus dias são preservados.

O filtro de outlet não desmarca ninguém: apenas escolhe quais linhas renderizar. A reconstrução da lista recupera os dias a partir de `selectedEmployees`, por ID.

## 4. Estado da aplicação

| Estado | O que guarda | Quem modifica | Quem consome |
| --- | --- | --- | --- |
| `employees` | Cadastro, IDs, nomes, cargos e outlets | Definição estática | Renderização e filtros |
| `selectedEmployees` | Cópias dos selecionados com dias como texto | `setEmployeeSelected`, `updateDaysWorked`, reset | Validação, revisão e cálculo |
| `selectedOutlet` | Filtro visual ou `null` para todos | Botões de outlet e reset | `getVisibleEmployees` |
| `tipsInput.value` | Entrada monetária original | Utilizador e reset | Conversor monetário e validação |
| `selectedMonth`, `selectedYear` | Período escolhido | Picker e reset | Validação e texto do período |
| `selectedPeriod.textContent` | Rótulo do período | Picker e reset | Revisão; copiado para o resultado |
| `calculationResult` | Snapshot da distribuição ou `null` | Cálculo, invalidação, cancelamento e reset | Resultado e PDF |
| `calculatingInterval` | Identificador do timer ou `null` | Início, conclusão e cancelamento da animação | Trava contra duplo cálculo e navegação |
| `calculationSession` | Identificador da distribuição atual | Inicialização e reset | Guardas do histórico |

As declarações centrais são:


```js
let selectedEmployees = [];
let selectedOutlet = null;
let calculationResult = null;
let calculatingInterval = null;
let calculationSession = Date.now();
```


O projeto conserva a entrada de gorjetas no próprio input, em vez de criar outro estado com o mesmo valor. A conversão acontece na fronteira com a lógica monetária. O snapshot é uma nova estrutura de dados: os objetos de pagamento são construídos por `map`, sem reutilizar os objetos mutáveis do rascunho.

O snapshot não é congelado com `Object.freeze`; a consistência vem do fluxo: UI e PDF somente o leem, e toda edição normal invalida o resultado. `history.state` guarda somente tela e sessão, nunca uma cópia dos pagamentos.

## 5. Validação

Há validação antes de avançar para colaboradores, antes de entrar na revisão e novamente ao clicar em CALCULATE. A função pura também valida seus argumentos. Assim, o cálculo não depende apenas dos atributos HTML.


```js
function parseDaysWorked(value) {
    if (!/^[0-9]+$/.test(String(value))) return null;
    const days = Number(value);
    return Number.isSafeInteger(days) && days >= 0 ? days : null;
}
```


A expressão aceita exclusivamente dígitos de zero a nove. `Number.isSafeInteger` exclui números fracionários, `NaN`, `Infinity` e inteiros acima da faixa exata de `Number`. Zero é válido: a aplicação testa `days === null`, e não `!days`, pois `!0` também seria verdadeiro.


```js
function validateParticipants(participants) {
    if (!participants.length) return 'Select at least one employee.';
    const ids = new Set();
    let totalDays = 0;
    for (const employee of participants) {
        if (!Number.isSafeInteger(employee.id) || employee.id <= 0 || ids.has(employee.id)) {
            return 'Employee IDs must be unique positive integers.';
        }
        ids.add(employee.id);
        const days = parseDaysWorked(employee.daysWorked);
        if (days === null) return `Enter whole, non-negative days for ${employee.name}.`;
        totalDays += days;
        if (!Number.isSafeInteger(totalDays)) return 'Total worked days is too large.';
    }
    return totalDays > 0 ? null : 'Total worked days must be greater than zero.';
}
```


Primeiro é preciso ter participantes. Depois cada ID deve ser um inteiro positivo e único, cada quantidade de dias deve ser válida e a soma deve continuar sendo um inteiro seguro. Finalmente, o total precisa ser maior que zero. Um colaborador com zero dias continua listado, conta no número de selecionados e recebe zero; ele não aumenta o denominador.

Não foi imposto um teto arbitrário de 31 dias: o requisito é inteiro não negativo, dentro da faixa numérica suportada. O período identifica a distribuição, mas não altera o peso de cada dia.

Para dinheiro, a aplicação aceita zero euros e rejeita negativos, vazio, notação exponencial, `NaN`, `Infinity`, mais de duas casas decimais e valores fora do limite. Zero gorjetas com dias positivos produz pagamentos zero. O limite técnico é `Number.MAX_SAFE_INTEGER` cêntimos: €90.071.992.547.409,91. Ele está indicado na mensagem de erro.

`validateCalculationForm()` mostra os erros nos campos existentes e exige um mês entre 0 e 11 e um ano inteiro positivo. `validateEmployeeSelection()` mostra o erro da equipe e atualiza `aria-invalid` nos inputs. As mensagens continuam em inglês para combinar com a interface.

## 6. Conversão para cêntimos

JavaScript representa `Number` em ponto flutuante binário. Frações como um décimo não têm representação binária finita. Por isso, `0.1 + 0.2` resulta em `0.30000000000000004`. Isso não significa que todos os cálculos com `Number` sejam imprecisos: inteiros até `Number.MAX_SAFE_INTEGER` são representados exatamente.

Também não basta escrever `Number(texto) * 100`: `0.29 * 100` pode resultar em `28.999999999999996`. Arredondar depois pode disfarçar alguns casos, mas o projeto evita a operação desde a entrada.


```js
function parseMoneyToCents(value) {
    let text = String(value).trim().replace(/^€\s*/, '');
    if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text)) {
        text = text.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(text)) {
        text = text.replace(/,/g, '');
    } else if (/^\d+([.,]\d{1,2})?$/.test(text)) {
        text = text.replace(',', '.');
    } else {
        return null;
    }
    const [euros, fraction = ''] = text.split('.');
    const cents = BigInt(euros) * 100n + BigInt(fraction.padEnd(2, '0'));
    return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}
```


A conversão lê os algarismos como texto:

1. Remove espaços nas extremidades e um símbolo € opcional no início.
2. Reconhece agrupamento português com decimal, como `1.234,56`, ou inglês, como `1,234.56`. Remove apenas os separadores de milhar reconhecidos.
3. Também aceita números sem agrupamento: `1234`, `1234.5`, `1234,56`.
4. Normaliza o separador decimal para ponto e separa a parte inteira da fração.
5. Completa a fração à direita: `5` vira `50`; ausência vira `00`.
6. Calcula `1234n * 100n + 56n = 123456n` com inteiros `BigInt`.
7. Só converte para `Number` depois de verificar o limite seguro.

`n` no final de `100n` identifica um literal `BigInt`. Não se deve misturar `BigInt` e `Number` na mesma operação aritmética: as conversões são explícitas.

Entradas ambíguas de agrupamento sem decimal, como `1.234` e `1,234`, são rejeitadas. Para mil duzentos e trinta e quatro euros, digite `1234`, `1.234,00` ou `1,234.00`. A implementação não adivinha se três dígitos após um separador significam milhar ou uma terceira casa decimal.

A apresentação também preserva cada cêntimo, inclusive perto do limite:


```js
function formatCents(cents) {
    const value = BigInt(cents);
    const euros = new Intl.NumberFormat('en-US').format(value / 100n);
    return `${euros}.${String(value % 100n).padStart(2, '0')}`;
}
```


`value / 100n` obtém euros inteiros e `value % 100n` obtém os cêntimos. `padStart(2, '0')` transforma 7 em `07`. `Intl.NumberFormat('en-US')` adiciona o agrupamento de milhares nos euros inteiros. Por exemplo, 123456 vira `1,234.56`; a UI e o PDF acrescentam `€ `. A apresentação mantém o formato inglês já usado pela interface, mesmo aceitando a entrada portuguesa.

Nenhuma quota é calculada a partir de uma string formatada.

## 7. Cálculo proporcional

A função recebe cêntimos inteiros e participantes; não lê inputs nem elementos HTML.


```js
function distributeTips(totalTipsCents, participants) {
    if (!Number.isSafeInteger(totalTipsCents) || totalTipsCents < 0) {
        throw new Error('Enter a valid, non-negative tips amount with up to two decimal places.');
    }
    const error = validateParticipants(participants);
    if (error) throw new Error(error);
    const totalWorkedDays = participants.reduce((sum, employee) => sum + parseDaysWorked(employee.daysWorked), 0);
    const divisor = BigInt(totalWorkedDays);
    const quotas = participants.map(employee => {
        const daysWorked = parseDaysWorked(employee.daysWorked);
        // BigInt keeps multiplication, division and remainders exact, even for large products.
        const numerator = BigInt(totalTipsCents) * BigInt(daysWorked);
        return {
            id: employee.id,
            name: employee.name,
            outlet: employee.outlet,
            daysWorked,
            amountCents: Number(numerator / divisor),
            remainder: numerator % divisor
        };
    });
    const allocated = quotas.reduce((sum, employee) => sum + employee.amountCents, 0);
    const remaining = totalTipsCents - allocated;
    const ranked = [...quotas].sort((a, b) => {
        if (a.remainder === b.remainder) return a.id - b.id;
        return a.remainder > b.remainder ? -1 : 1;
    });
    for (let index = 0; index < remaining; index++) {
        ranked[index].amountCents += 1;
    }
    const payments = quotas.map(({ remainder, ...employee }) => employee);
    const totalDistributedCents = payments.reduce((sum, employee) => sum + employee.amountCents, 0);
    // Rounded only for display. Payments above never use this rate.
    const valuePerDayCents = Number((BigInt(totalTipsCents) * 2n + divisor) / (2n * divisor));
    return { totalTipsCents, totalWorkedDays, valuePerDayCents, employeeCount: payments.length, payments, totalDistributedCents };
}
```


Para €100, A com 20 dias e B com 10:

| Etapa | A | B |
| --- | --- | --- |
| Total de dias | 30 | 30 |
| Numerador em cêntimos × dias | 10000 × 20 = 200000 | 10000 × 10 = 100000 |
| Quota exata em cêntimos | 200000 / 30 = 6666,666… | 100000 / 30 = 3333,333… |
| Parte inteira | 6666 | 3333 |
| Resto inteiro da divisão | 20 | 10 |
| Ajuste | +1 | +0 |
| Pagamento | 6667 cêntimos = €66,67 | 3333 cêntimos = €33,33 |

O total inicial é 9999 cêntimos; falta um. A recebe esse cêntimo porque seu resto é maior. O total final é exatamente 10000.

`totalWorkedDays` é calculado com `reduce`: começa em zero e adiciona os dias validados de cada selecionado. O denominador é comum a todos. Assim, comparar os restos inteiros (`20` e `10`) equivale a comparar as frações (`20/30` e `10/30`). Não é necessário produzir uma aproximação decimal da quota.

Mesmo quando o total e os dias cabem em inteiros seguros, o produto pode ultrapassar esse limite. Por isso `numerator` e `divisor` usam `BigInt`, que mantém multiplicação, divisão inteira e resto exatos. O pagamento final nunca excede o total validado e pode voltar a `Number` com segurança.

## 8. Arredondamento

O método dos maiores restos começa distribuindo a parte inteira de cada quota. A divisão entre `BigInt` descarta a fração; como os números são não negativos, isso equivale ao piso matemático.

Depois:

- `allocated` soma os cêntimos já atribuídos.
- `remaining` é o total original menos essa soma.
- `[...quotas]` copia o array para ordenar sem mudar a ordem de apresentação.
- O comparador coloca o maior resto primeiro. Se os restos empatam, usa `a.id - b.id`, priorizando o menor ID.
- O laço concede um cêntimo aos primeiros `remaining` registros.
- `payments` remove a propriedade temporária `remainder` e cria os registros finais.

A cópia do array é superficial: `ranked` e `quotas` apontam para os mesmos objetos temporários. Incrementar `ranked[index].amountCents` atualiza o objeto que depois será copiado para `payments`. O rascunho original continua intacto porque esses objetos temporários foram criados pelo primeiro `map`.

Com €100 e três pessoas com um dia, as quotas são 3333,333… cêntimos. Truncar dá 3333 para cada uma: 9999 no total. Todos os restos são `1n` com divisor `3n`. O menor ID recebe o único cêntimo residual: **€33,34 + €33,33 + €33,33 = €100,00**.

Se arredondássemos separadamente 33,333… euros para duas casas, teríamos €33,33 três vezes: €99,99. Arredondar a taxa diária antes de multiplicar tem o mesmo problema. No exemplo 20/10, usar €3,33 daria €66,60 + €33,30 = €99,90.

Por que sempre fecha? A soma das quotas exatas é o total. Ao descartar as frações, a diferença é um inteiro não negativo, menor que o número de participantes. O laço adiciona exatamente essa quantidade de cêntimos. Uma pessoa com zero dias tem quota e resto zero; os restos positivos bastam para absorver os resíduos existentes, portanto ela não recebe um cêntimo indevido.

A taxa diária visual é calculada separadamente, depois dos pagamentos:

```js
const valuePerDayCents = Number((BigInt(totalTipsCents) * 2n + divisor) / (2n * divisor));
```

Para valores não negativos, essa fórmula arredonda `totalTipsCents / divisor` ao cêntimo mais próximo, com metade arredondada para cima, usando apenas inteiros. Ela não volta ao cálculo dos pagamentos. Com um cêntimo dividido por 200 dias, pode aparecer €0,00 por dia, mas o cêntimo real continua sendo distribuído.

O desempate por ID é determinístico e independe da ordem dos cliques. Em empates repetidos, o mesmo ID terá preferência; não há rotação entre meses porque esta aplicação não mantém histórico. A justiça usada aqui consiste em priorizar a maior fração descartada, com um desempate transparente.

## 9. Review


```js
function updateReviewSummary() {
    reviewPeriod.textContent = selectedPeriod.textContent;
    reviewTips.textContent = '€ ' + formatCents(parseMoneyToCents(tipsInput.value));
    reviewCount.textContent = selectedEmployees.length;
    document.querySelector('#review-days').textContent = selectedEmployees.reduce(
        (sum, employee) => sum + parseDaysWorked(employee.daysWorked), 0
    );
}
```


A revisão lê o rascunho validado. Mostra o período, o dinheiro convertido e formatado, a quantidade de selecionados e a soma dos dias. `renderReviewEmployees()` chama `renderDistributionRows()` com `includeAmount = false`, exibindo nome, outlet e dias.

A revisão não distribui dinheiro. Serve para conferir as entradas antes de gerar o snapshot. `showScreen('review')` reconstrói os dados toda vez que a tela é exibida, inclusive ao voltar ou avançar no histórico. Assim, não mostra um resumo antigo depois de editar os dias.

## 10. Result


```js
function calculateDistribution() {
    if (!hasValidPeriod()) throw new Error('Please select a period.');
    return {
        period: selectedPeriod.textContent,
        ...distributeTips(parseMoneyToCents(tipsInput.value), selectedEmployees)
    };
}
```


Esta função une a lógica pura à aplicação. Verifica o período, converte as gorjetas e chama `distributeTips`. O spread `...` copia as propriedades calculadas para um objeto que também contém o período.

No clique de CALCULATE, o formulário e a seleção são validados novamente. `calculationResult` recebe esse objeto antes da animação. A barra apenas apresenta o progresso visual: ela não realiza a conta. Ao terminar, `showResult()` navega para a tela de resultado.


```js
function renderResult() {
    const result = calculationResult;
    resultPeriod.textContent = result.period;
    resultTips.textContent = '€ ' + formatCents(result.totalTipsCents);
    resultCount.textContent = result.employeeCount;
    resultAmount.textContent = '€ ' + formatCents(result.valuePerDayCents);
    document.querySelector('#result-days').textContent = result.totalWorkedDays;
    document.querySelector('#result-total').textContent = '€ ' + formatCents(result.totalDistributedCents);
    renderDistributionRows(document.querySelector('#result-employee-list'), result.payments, true);
}
```


Todos os valores desta tela vêm de `calculationResult`. A função não divide dinheiro. Os IDs continuam em cada pagamento e são colocados em `data-employee-id` nas linhas do DOM.


```js
function renderDistributionRows(container, participants, includeAmount) {
    container.replaceChildren();
    participants.forEach(employee => {
        const row = document.createElement('div');
        row.className = includeAmount ? 'distribution-row with-amount' : 'distribution-row';
        row.dataset.employeeId = employee.id;
        const values = [employee.name, employee.outlet, employee.daysWorked + ' days'];
        if (includeAmount) values.push('€ ' + formatCents(employee.amountCents));
        values.forEach(value => {
            const cell = document.createElement('span');
            cell.textContent = value;
            row.appendChild(cell);
        });
        container.appendChild(row);
    });
}
```


A mesma função monta as linhas de revisão e resultado. `textContent` insere os textos como conteúdo, sem interpretar HTML. O último campo monetário aparece somente quando `includeAmount` é verdadeiro. A soma exibida em TOTAL DISTRIBUTED é a soma dos pagamentos finais, não uma cópia decorativa do valor digitado.

## 11. PDF

`generatePDF()` lê `const result = calculationResult`. Não consulta `selectedEmployees` para refazer pagamentos e não multiplica dias pela taxa visual. Por isso o resultado impresso corresponde aos mesmos pagamentos da tela.

O relatório mantém título, fonte Helvetica e aparência simples. Acrescenta período, total de gorjetas, total de dias, taxa diária identificada como arredondada, quantidade de pessoas, regra de distribuição e a tabela com nome/outlet/dias/pagamento. O total distribuído vem de `result.totalDistributedCents`.

Trecho real que escreve cada linha:


```js
        result.payments.forEach(employee => {
            const name = pdf.splitTextToSize(employee.name, 58);
            const outlet = pdf.splitTextToSize(employee.outlet, 50);
            const days = pdf.splitTextToSize(String(employee.daysWorked), 22);
            const rowHeight = Math.max(name.length, outlet.length, days.length) * 5 + 4;
            if (y + rowHeight > 262) {
                pdf.addPage();
                y = 24;
                tableHeader();
            }
            pdf.text(name, 20, y);
            pdf.text(outlet, 82, y);
            pdf.text(days, 143, y, { align: 'right' });
            pdf.text('€ ' + formatCents(employee.amountCents), 190, y, { align: 'right' });
            y += rowHeight;
        });
```


`splitTextToSize` quebra nomes, outlets ou dias longos na largura reservada. A altura da linha é a maior quantidade de linhas de suas células, vezes cinco milímetros, mais quatro de espaçamento. Antes de desenhar, o código verifica se a linha cabe. Caso contrário, abre uma página, repete o cabeçalho e só então escreve.

O total também tem uma verificação de espaço. Depois de preencher o relatório, um laço percorre as páginas para acrescentar rodapé e paginação. `pdf.save()` usa o período do snapshot no nome do arquivo.

Se não houver resultado, a função pede um cálculo antes do download. Se a biblioteca estiver indisponível ou a geração falhar, um `try/catch` mostra a mensagem em `#pdf-error`, com `role="alert"`. A biblioteca continua carregada pelo CDN existente, portanto baixar o PDF requer que esse recurso tenha sido carregado.

Calcular separadamente na UI e no PDF seria uma fonte de divergência: uma parte poderia arredondar a taxa antes de multiplicar, ou usar dias alterados depois da distribuição. A única fonte de pagamentos é `result.payments`.

## 12. Reset


```js
function invalidateResult() {
    cancelCalculation();
    calculationResult = null;
    document.querySelectorAll('.result-field strong, #result-amount, #result-total').forEach(node => {
        node.textContent = '—';
    });
    document.querySelector('#result-employee-list').replaceChildren();
    document.querySelector('#pdf-error').textContent = '';
}
```


Editar gorjetas, período, seleção ou dias invalida o snapshot. Esta função também limpa os números já renderizados, as linhas de pagamentos e a mensagem de PDF. Esconder a tela sem limpar os dados não seria suficiente: o histórico poderia revelar conteúdo antigo.


```js
function resetCalculation() {
    calculationSession++;
    invalidateResult();
    periodPicker.style.display = 'none';
    isPeriodPickerOpen = false;
    periodArrow.textContent = '↓';
    pickerYearValue = new Date().getFullYear();
    pickerYear.textContent = pickerYearValue;
    document.querySelectorAll('.review-field strong').forEach(node => node.textContent = '—');
    document.querySelector('#review-employee-list').replaceChildren();
    document.querySelector('.calculating-loader-bar').style.width = '0%';
    document.querySelector('#calculating-percentage').textContent = '0%';
    tipsInput.value = "";
    tipsInput.removeAttribute("aria-invalid");

    selectedPeriod.textContent = "SELECT PERIOD";

    selectedYear = null;
    selectedMonth = null;

    monthButtons.forEach((month) => {
        month.classList.remove("selected");
    });

    clearPeriodError();

    tipsError.textContent = "";
    tipsError.classList.remove("visible");
    tipsField.classList.remove("has-error");

    selectedEmployees = [];
    selectedOutlet = null;

    employeeError.classList.remove("visible");

    outletList.querySelectorAll("button").forEach((button) => {
        button.classList.remove("active");
    });

    allOutletsButton.classList.add("active");

    renderEmployees(employees);

    calculationResult = null;
}
```


O reset começa avançando `calculationSession`. Cada entrada criada no histórico carrega sua sessão. Ao voltar para uma entrada de outra distribuição, o handler de `popstate` manda para a tela inicial. O histórico do navegador não é apagado; suas entradas antigas deixam de autorizar telas com dados obsoletos.

Além do resultado, são limpos input de gorjetas, período, mês/ano, seleção, filtro, erros, revisão, barra e percentual da animação. O picker volta ao ano atual e fecha. `renderEmployees(employees)` reconstrói a lista sem selecionados e atualiza o contador para zero.


```js
function cancelCalculation() {
    if (calculatingInterval !== null) {
        clearInterval(calculatingInterval);
        calculatingInterval = null;
        calculationResult = null;
    }
    calculateButton.disabled = false;
}
```


Se o utilizador volta durante a animação, o timer é cancelado, o resultado incompleto é descartado e o botão é reabilitado. O callback antigo não pode redirecionar a pessoa ao resultado alguns segundos depois. Na conclusão normal, o intervalo já foi encerrado e colocado em `null` antes de navegar, preservando o resultado concluído.

`resolveScreen()` também verifica se período, dinheiro e seleção permitem mostrar a tela solicitada. Resultado sem snapshot volta para revisão ou seleção, conforme a validade das entradas. Recarregar a página inicializa tudo de novo e substitui a rota por `#calculation`: não há persistência do rascunho.

## 13. Fluxo completo

```text
Período + total de gorjetas no formulário
                  ↓
validateCalculationForm + parseMoneyToCents
                  ↓
Checkboxes → setEmployeeSelected → selectedEmployees
Dias       → updateDaysWorked    → daysWorked (texto)
                  ↓
validateParticipants + parseDaysWorked
                  ↓
Review: período, total, nomes, outlets e dias
                  ↓
CALCULATE: revalida e chama calculateDistribution
                  ↓
distributeTips: soma dias → quotas inteiras → maiores restos
                  ↓
calculationResult: snapshot com payments em cêntimos
                  ↓
Animação concluída
                  ↓
          ┌───────┴────────┐
     renderResult     generatePDF
     mesma fonte       mesma fonte

Edição → invalidateResult
Voltar durante a animação → cancelCalculation
NEW CALCULATION → resetCalculation + nova sessão
Reload → estado inicial vazio
```

## 14. Funções importantes

| Função | Recebe | Retorna | Responsabilidade |
| --- | --- | --- | --- |
| `parseMoneyToCents` | Entrada monetária | Inteiro em cêntimos ou `null` | Interpretar formatos aceitos sem multiplicação decimal |
| `formatCents` | Cêntimos inteiros válidos | String formatada, sem € | Apresentar a quantia exatamente |
| `parseDaysWorked` | Texto ou número | Inteiro não negativo ou `null` | Validar uma quantidade de dias |
| `validateParticipants` | Array de selecionados | Mensagem ou `null` | Validar seleção, IDs, dias e total |
| `distributeTips` | Cêntimos e participantes | Objeto de distribuição; lança erro se inválido | Calcular e conciliar pagamentos |
| `setEmployeeSelected` | Cadastro e booleano | `undefined` | Adicionar cópia ou remover selecionado |
| `updateDaysWorked` | ID e texto | `undefined` | Alterar os dias da pessoa correta |
| `validateCalculationForm` | Estado/DOM atuais | Booleano | Validar período e gorjetas, exibir erros |
| `validateEmployeeSelection` | Estado/DOM atuais | Booleano | Validar equipe e apresentar feedback |
| `updateReviewSummary` | Rascunho via estado/DOM | `undefined` | Preencher os totais da revisão |
| `calculateDistribution` | Estado/DOM atuais | Snapshot com período | Adaptar as entradas para a função pura |
| `renderDistributionRows` | Container, participantes, booleano | `undefined` | Criar linhas de revisão ou pagamentos |
| `renderResult` | Snapshot via estado | `undefined` | Mostrar resultado sem recalcular |
| `generatePDF` | Snapshot via estado | `undefined` | Gerar/download do relatório ou mostrar erro |
| `resolveScreen` | Nome de tela | Nome de tela permitido | Impedir navegação com estado insuficiente |
| `cancelCalculation` | Timer via estado | `undefined` | Impedir conclusão tardia após navegação |
| `invalidateResult` | Estado atual | `undefined` | Limpar snapshot e apresentação anterior |
| `resetCalculation` | Estado atual | `undefined` | Iniciar distribuição vazia e nova sessão |

## 15. Explicação linha por linha

As tabelas indicam o número da linha dentro do trecho de cada função mostrado acima, incluindo sua declaração como linha 1. Linhas vazias e fechamentos de blocos não executam operações: servem para separar e delimitar o código. Cada linha que toma uma decisão, calcula ou muda o estado é explicada abaixo.

### `setEmployeeSelected`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `const existing` | Procura o ID no rascunho, em vez de comparar a identidade de objetos. Cópias do cadastro continuam identificáveis. |
| 3 | `if (selected && !existing)` | Acrescenta somente se ainda não existe. O spread copia o cadastro e cria dias vazios, sem alterar o catálogo. |
| 4 | `if (!selected)` | Mantém apenas IDs diferentes do desmarcado. Seus dias saem junto com seu registro. |
| 5 | `invalidateResult();` | Descarta uma distribuição baseada numa seleção anterior. |
| 6 | `employeeError.classList.remove('visible')` | Oculta a mensagem antiga enquanto a pessoa corrige a seleção. |
| 7 | `updateSelectedCount();` | Atualiza a quantidade visível a partir do tamanho atual do array. |

### `updateDaysWorked`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `const employee` | Encontra o único rascunho com o ID do evento. |
| 3 | `if (!employee) return` | Protege contra atualização de alguém já desmarcado. |
| 4 | `employee.daysWorked = value` | Preserva o texto exatamente como chegou do input; ainda não é um pagamento validado. |
| 5 | `invalidateResult();` | Impede usar um resultado calculado com os dias anteriores. |
| 6 | `employeeError.classList.remove('visible')` | Permite corrigir e submeter novamente; a próxima validação decide se está resolvido. |

### `parseDaysWorked`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `if (!/^[0-9]+$/` | Exige ao menos um dígito e a string inteira composta de dígitos. Rejeita vazio, sinal, decimal, expoente e letras. |
| 3 | `const days = Number(value)` | Converte somente depois de verificar a forma textual. |
| 4 | `return Number.isSafeInteger` | Exige um inteiro exatamente representável e não negativo. Retorna null se inválido, sem confundir zero com erro. |

### `validateParticipants`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `if (!participants.length)` | Sem selecionados não existe distribuição; devolve uma mensagem antes de qualquer divisão. |
| 3 | `const ids = new Set()` | Prepara um conjunto para detectar IDs repetidos. |
| 4 | `let totalDays = 0` | Inicializa o acumulador de dias. |
| 5 | `for (const employee` | Percorre cada participante necessário ao cálculo. |
| 6 | `if (!Number.isSafeInteger(employee.id)` | Exige um ID inteiro seguro e positivo, que ainda não foi visto. |
| 7 | `return 'Employee IDs` | Interrompe a validação quando a identidade não é confiável. |
| 9 | `ids.add(employee.id)` | Registra o ID para a próxima iteração. |
| 10 | `const days = parseDaysWorked` | Valida a entrada daquela pessoa antes de somar. |
| 11 | `if (days === null)` | Identifica o colaborador que precisa corrigir os dias; zero passa. |
| 12 | `totalDays += days` | Adiciona só dias já validados. |
| 13 | `if (!Number.isSafeInteger(totalDays))` | Bloqueia uma soma que ultrapasse a faixa exata de Number. |
| 15 | `return totalDays > 0` | Um total positivo significa sucesso, representado por null; zero devolve erro. |

### `parseMoneyToCents`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `let text = String(value)` | Normaliza a entrada para texto, remove espaços externos e aceita € somente no início. |
| 3 | `if (/^\d{1,3}(\.\d{3})+,` | Reconhece grupos de três algarismos separados por ponto, seguidos de decimal com vírgula. |
| 4 | `text = text.replace(/\./g` | Remove pontos de milhar e converte a vírgula decimal em ponto. |
| 5 | `} else if (/^\d{1,3}(,` | Reconhece a alternativa inglesa, com vírgulas de milhar e ponto decimal. |
| 6 | `text = text.replace(/,/g` | Retira apenas as vírgulas do formato inglês já reconhecido. |
| 7 | `} else if (/^\d+([.,]` | Aceita inteiro sem agrupamento, opcionalmente com uma ou duas casas decimais. |
| 8 | `text = text.replace(',', '.')` | Na alternativa sem agrupamento, padroniza o separador decimal. |
| 10 | `return null` | Se nenhuma forma foi reconhecida, não tenta adivinhar nem arredondar a entrada. |
| 12 | `const [euros, fraction = '']` | Desestrutura a parte inteira e a fração; a fração ausente vira string vazia. |
| 13 | `const cents = BigInt(euros)` | Multiplica os euros inteiros por cem e soma a fração completada à direita. Toda a conta usa BigInt. |
| 14 | `return cents <= BigInt` | Verifica a faixa suportada antes de converter a Number; devolve null quando excessivo. |

### `formatCents`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `const value = BigInt(cents)` | Recebe cêntimos inteiros já validados e converte para operações inteiras de apresentação. |
| 3 | `const euros = new Intl.NumberFormat` | Divide por cem com divisão inteira e formata somente os euros, sem perda de cêntimos em números grandes. |
| 4 | `return` | Junta euros, ponto e resto da divisão por cem preenchido com dois algarismos. |

### `distributeTips`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `if (!Number.isSafeInteger(totalTipsCents)` | Recusa total monetário fracionário, negativo, não finito ou fora da faixa segura. |
| 3 | `throw new Error('Enter` | Encerra com erro em vez de fabricar um resultado inválido. |
| 5 | `const error = validateParticipants` | Repete as pré-condições no núcleo, mesmo se ele for chamado sem passar pela UI. |
| 6 | `if (error) throw new Error(error)` | Nenhuma quota é produzida se seleção, identidade ou dias forem inválidos. |
| 7 | `const totalWorkedDays = participants.reduce` | Começa em zero e soma os dias de todos os participantes validados; pessoas fora do array não entram. |
| 8 | `const divisor = BigInt(totalWorkedDays)` | Cria o denominador inteiro comum a todas as quotas. Já foi garantido que não é zero. |
| 9 | `const quotas = participants.map` | Cria um novo objeto temporário por participante, preservando a ordem de apresentação. |
| 10 | `const daysWorked = parseDaysWorked` | Converte os dias do rascunho para o inteiro final. |
| 12 | `const numerator = BigInt(totalTipsCents)` | Multiplica cêntimos por dias sem perder precisão quando o produto excede a faixa de Number. |
| 13 | `return {` | O callback retorna o objeto temporário daquela quota. |
| 14 | `id: employee.id` | Mantém a identidade e o critério estável de desempate. |
| 15 | `name: employee.name` | Copia o nome a ser exibido no snapshot. |
| 16 | `outlet: employee.outlet` | Copia o outlet para identificação visual, sem peso na fórmula. |
| 17 | `            daysWorked,` | Usa a abreviação de propriedade: equivale a daysWorked: daysWorked. |
| 18 | `amountCents: Number(numerator / divisor)` | Obtém a parte inteira da quota e a converte para Number. Como não excede o total, permanece na faixa segura. |
| 19 | `remainder: numerator % divisor` | Guarda exatamente a parte que sobrou da divisão, sem representar uma fração decimal. |
| 22 | `const allocated = quotas.reduce` | Soma os pagamentos inteiros iniciais. Todos são não negativos; a soma não excede o total. |
| 23 | `const remaining = totalTipsCents - allocated` | Calcula quantos cêntimos ainda precisam ser pagos. |
| 24 | `const ranked = [...quotas].sort` | Copia o array para ordenar; os objetos temporários continuam compartilhados com quotas. |
| 25 | `if (a.remainder === b.remainder)` | Em empate, menor ID vem primeiro. A ordem de seleção e o outlet não decidem o residual. |
| 26 | `return a.remainder > b.remainder` | Nos demais casos, maior resto vem primeiro. Retorna -1 ou 1 como Number, conforme o contrato de sort. |
| 28 | `for (let index = 0; index < remaining` | Executa exatamente uma iteração por cêntimo residual; remaining é menor que a quantidade de participantes. |
| 29 | `ranked[index].amountCents += 1` | Concede um cêntimo ao próximo maior resto e modifica o mesmo objeto visto por quotas. |
| 31 | `const payments = quotas.map` | A desestruturação retira remainder; o spread restante cria o registro final sem expor BigInt temporário. |
| 32 | `const totalDistributedCents = payments.reduce` | Reconta o total usando os pagamentos finais efetivamente atribuídos. |
| 34 | `const valuePerDayCents = Number` | Arredonda somente a taxa visual, em inteiros. Nenhuma quota depende dela. |
| 35 | `return { totalTipsCents` | Entrega todos os campos necessários para reutilizar a distribuição, sem tocar no DOM ou no rascunho. |

### `calculateDistribution`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `if (!hasValidPeriod())` | Protege a criação do snapshot contra período incompleto. |
| 3 | `return {` | Cria o objeto do resultado da aplicação. |
| 4 | `period: selectedPeriod.textContent` | Copia o rótulo do período agora; o PDF não precisará buscar o picker depois. |
| 5 | `...distributeTips` | Converte dinheiro, calcula a distribuição e expande os campos retornados no mesmo objeto. |

### `renderResult`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `const result = calculationResult` | Usa o snapshot autorizado pela navegação. |
| 3 | `resultPeriod.textContent` | Apresenta o período copiado no cálculo. |
| 4 | `resultTips.textContent` | Formata os cêntimos originais. |
| 5 | `resultCount.textContent` | Mostra todos os participantes selecionados, incluindo os que têm zero dias. |
| 6 | `resultAmount.textContent` | Apresenta a taxa diária arredondada, sem calcular pagamentos. |
| 7 | `document.querySelector('#result-days')` | Apresenta o total de dias validado. |
| 8 | `document.querySelector('#result-total')` | Mostra a soma dos pagamentos finais. |
| 9 | `renderDistributionRows` | Passa a lista de pagamentos e true para incluir a coluna monetária. |

### `cancelCalculation`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `if (calculatingInterval !== null)` | Distingue animação pendente de resultado já concluído. |
| 3 | `clearInterval(calculatingInterval)` | Impede novas chamadas do callback que avançava a barra. |
| 4 | `calculatingInterval = null` | Marca que não há trabalho pendente. |
| 5 | `calculationResult = null` | Descarta o snapshot de uma animação abandonada. |
| 7 | `calculateButton.disabled = false` | Permite um novo cálculo depois do cancelamento ou da navegação. |

### `invalidateResult`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `cancelCalculation();` | Cancela primeiro um timer que poderia tentar mostrar o resultado antigo. |
| 3 | `calculationResult = null` | Retira a fonte de dados usada pela UI e pelo PDF. |
| 4 | `document.querySelectorAll` | Seleciona os totais e a taxa já renderizados. |
| 5 | `node.textContent = '—'` | Substitui valores monetários antigos por um marcador vazio. |
| 7 | `document.querySelector('#result-employee-list')` | Remove todos os pagamentos anteriores do DOM. |
| 8 | `document.querySelector('#pdf-error')` | Limpa a mensagem de exportação pertencente ao resultado anterior. |

### `resetCalculation`

| Linha do trecho | Código de referência | Como e por quê |
| --- | --- | --- |
| 2 | `calculationSession++` | Invalida as entradas do histórico ligadas à distribuição anterior. |
| 3 | `invalidateResult();` | Cancela cálculo pendente e apaga snapshot, valores e linhas do resultado. |
| 4 | `periodPicker.style.display = 'none'` | Fecha visualmente o seletor de período. |
| 5 | `isPeriodPickerOpen = false` | Sincroniza o estado lógico com o picker fechado. |
| 6 | `periodArrow.textContent = '↓'` | Restaura o indicador do botão. |
| 7 | `pickerYearValue = new Date()` | Escolhe o ano atual para a próxima seleção. |
| 8 | `pickerYear.textContent = pickerYearValue` | Mostra o ano restaurado no picker. |
| 9 | `document.querySelectorAll('.review-field strong')` | Apaga os totais e o período renderizados na revisão. |
| 10 | `document.querySelector('#review-employee-list')` | Remove os colaboradores da revisão anterior. |
| 11 | `document.querySelector('.calculating-loader-bar')` | Zera a largura da barra do cálculo. |
| 12 | `document.querySelector('#calculating-percentage')` | Zera o texto do percentual. |
| 13 | `tipsInput.value = ""` | Limpa a entrada de dinheiro; zero não é confundido com campo vazio. |
| 14 | `tipsInput.removeAttribute` | Retira a marca de entrada inválida da distribuição anterior. |
| 16 | `selectedPeriod.textContent` | Restaura SELECT PERIOD. |
| 18 | `selectedYear = null` | Remove o ano selecionado. |
| 19 | `selectedMonth = null` | Remove o mês selecionado. |
| 21 | `monthButtons.forEach` | Percorre os botões de mês para limpar a aparência de seleção. |
| 22 | `month.classList.remove` | Retira a classe de mês selecionado. |
| 25 | `clearPeriodError();` | Remove texto e destaque de erro do período. |
| 27 | `tipsError.textContent` | Limpa a mensagem de erro monetário. |
| 28 | `tipsError.classList.remove` | Oculta o erro monetário. |
| 29 | `tipsField.classList.remove` | Retira o destaque visual do campo monetário. |
| 31 | `selectedEmployees = []` | Descarta todas as cópias selecionadas, inclusive os dias armazenados. |
| 32 | `selectedOutlet = null` | Retorna ao filtro de todos os outlets. |
| 34 | `employeeError.classList.remove` | Oculta a mensagem antiga da equipe. |
| 36 | `outletList.querySelectorAll` | Percorre os filtros para remover a seleção visual anterior. |
| 37 | `button.classList.remove` | Retira active de cada filtro. |
| 40 | `allOutletsButton.classList.add` | Marca ALL OUTLETS como ativo. |
| 42 | `renderEmployees(employees)` | Reconstrói os campos vazios/desabilitados e atualiza o contador. |
| 44 | `calculationResult = null` | Mantém explicitamente o resultado ausente ao encerrar o reset. |

### Estado, eventos e apresentação

`let selectedEmployees = []` cria o rascunho vazio; `let selectedOutlet = null` significa todos os outlets. `let calculationResult = null` significa ausência de distribuição. `let calculatingInterval = null` significa ausência de animação pendente. `let calculationSession = Date.now()` cria a referência usada nas entradas desta execução do navegador. O reset a incrementa. São valores em memória: reload os inicializa novamente.

No listener de dias, a primeira instrução passa `employee.id` e `input.value` para `updateDaysWorked`; a segunda recalcula `aria-invalid` a partir de `parseDaysWorked`. No listener do checkbox, `setEmployeeSelected` muda o rascunho; `classList.toggle` acompanha a seleção visual; `hidden` controla o label de dias; `disabled` retira o campo da interação quando desmarcado; `value = ''` limpa a escrita anterior; `aria-invalid` indica que uma nova seleção ainda precisa de dias.

O HTML acrescenta campos de total de dias na revisão e no resultado, uma lista de pagamentos e uma região de erro do PDF. O CSS mantém a paleta e a tipografia e transforma as colunas em linhas empilhadas no mobile. A regra `flex: 0 0 auto` em `.employee` impede que a lista com rolagem comprima a altura dos inputs: sem ela, a linha seguinte podia cobrir o campo de dias. Os inputs têm altura mínima de 44 px, fonte de 16 px e foco visível. Labels, checkbox nativo e atributos ARIA fazem parte do comportamento; não são apenas decoração.

## 16. O que eu preciso saber explicar em uma entrevista

| Pergunta | Resposta baseada nesta implementação |
| --- | --- |
| Por que trabalhou com cêntimos? | Porque pagamentos precisam de unidades inteiras. O parser monta os cêntimos a partir do texto, evitando `Number(texto) * 100` e seus erros binários. |
| Por que também usa `BigInt`? | O produto entre dinheiro e dias pode ultrapassar a faixa segura de `Number`, mesmo se cada entrada couber. Multiplicação, divisão inteira e resto usam `BigInt`. |
| Como resolveu o arredondamento? | Primeiro atribuo o piso de cada quota em cêntimos. Ordeno os restos e entrego um cêntimo a cada um dos maiores, até consumir o residual. |
| Por que a soma sempre bate? | O residual é calculado como total menos a soma dos pisos. O laço adiciona exatamente esse número de cêntimos aos pagamentos. |
| Como desempata? | Menor ID primeiro. Os IDs são explícitos e únicos; mudar a ordem dos cliques não muda quem recebe o residual. |
| Isso é justo em todos os meses? | Prioriza a maior fração descartada. Empates repetidos favorecem o mesmo menor ID; não há rotação histórica nesta versão. |
| Por que não multiplica pela taxa diária exibida? | Essa taxa já foi arredondada. Usá-la perderia ou criaria cêntimos; as quotas usam total e dias exatos. |
| O que acontece com zero dias? | A pessoa recebe zero. Se todos têm zero, bloqueio a distribuição antes de dividir. |
| O que acontece com zero gorjetas? | É permitido com dias totais positivos; todos recebem zero, sem erro nem divisão inválida. |
| Como os funcionários são relacionados aos inputs? | Cada input captura o ID do cadastro em seu listener. O rascunho é procurado por ID, e o resultado mantém o mesmo ID. |
| O que acontece ao desmarcar? | O registro com seus dias sai de `selectedEmployees`. Selecionar novamente começa em branco. |
| O outlet muda o cálculo? | Não. É filtro e informação de apresentação. Cargo também não entra na fórmula. |
| Por que guardar dias como string no rascunho? | Para distinguir ausência, zero e uma escrita inválida sem conversões silenciosas. O resultado só recebe dias inteiros validados. |
| Qual a complexidade? | Para n participantes, soma e mapeamentos são O(n); ordenar os restos é O(n log n); espaço extra O(n). Isso considera a aritmética de inteiros neste domínio limitado. |
| O cálculo modifica o rascunho? | Não. Cria quotas temporárias e depois pagamentos novos. Somente os objetos de quotas são compartilhados com o array ordenado. |
| Como evita inconsistência entre UI e PDF? | Ambos consomem o mesmo snapshot `calculationResult`; nenhum recalcula pagamentos a partir de uma taxa formatada. |
| Como evita um resultado antigo depois de editar? | Os eventos de entrada invalidam o snapshot e limpam sua apresentação. Navegação só permite resultado quando há snapshot válido no fluxo. |
| Como lida com voltar durante a animação? | Cancela o intervalo e descarta o snapshot pendente, impedindo redirecionamento tardio. |
| Como uma nova distribuição não herda estado? | Reset limpa entradas, seleção, dias, resultados, revisão e timer; também muda a sessão associada às entradas do histórico. |
| O que acontece ao recarregar? | Começa vazio em `#calculation`. Nada é persistido em localStorage ou backend. |
| Como comprovou a lógica? | Dez testes unitários cobrem A–F, formatos monetários, entradas inválidas, limites, conservação do total e imutabilidade. Um roteiro no Chrome testa o fluxo, teclado, navegação, reset, responsividade e PDF real. |

### Exercícios rápidos para estudar

Antes de consultar o código, tente responder: com um cêntimo, A com zero dias, B e C com cem dias cada, quem recebe? B, se tiver o menor ID entre B e C. A recebe zero. A taxa visual aparece como €0,00, mas o total distribuído é €0,01.

No caso D dos testes, os dias são `[22, 18, 7, 3, 0]`, somando 50. Para 123456 cêntimos, os pagamentos são `[54321, 44444, 17284, 7407, 0]`. Em euros: **€543,21 + €444,44 + €172,84 + €74,07 + €0,00 = €1.234,56**. Os restos são 32, 8, 42, 18 e 0, com divisor 50; os dois cêntimos residuais vão para a terceira e a primeira pessoa.

### Como repetir os testes

Na raiz do projeto, com Node instalado:

```sh
node --check distribution.js
node --check script.js
node --test tests/distribution.test.cjs
node tests/browser.cjs
```

O último comando usa um Chrome headless real com perfil temporário e servidor HTTP local; não abre nem altera o perfil pessoal do navegador. Por padrão procura o Chrome no caminho Windows usado neste ambiente. Se necessário, defina `CHROME_PATH` com o executável instalado. O roteiro usa o WebSocket nativo do Node; foi executado com Node 24.18.0. O teste de exportação precisa de rede para carregar o jsPDF do CDN. Não há instalação de pacotes no projeto.

O teste do navegador imprime o diretório temporário que contém capturas, PDF e `results.json`. Foram aprovadas 30 verificações nomeadas, mais verificações geométricas dos campos em 320, 375, 768, 1024 e 1440 px. Entre elas: teclado com Espaço/Tab, dias inválidos, seleção por outlet, voltar/avançar com revisão atualizada, cancelamento do timer, reset, reload e download real de PDF com 63 colaboradores. O PDF produzido tem três páginas e total de €1.234,56; sua renderização também foi inspecionada com PDF.js em uma ferramenta temporária de verificação, sem adicionar PDF.js à aplicação.

As capturas confirmaram que os novos campos cabem nas linhas depois do ajuste de `flex`. Ainda é útil validar teclado virtual, toque e rolagem num telefone real, a experiência com leitor de tela e a impressão no visualizador PDF utilizado no dia a dia. Emulação de viewport não substitui esses testes.

### Referências das APIs utilizadas

- [BigInt — MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt): tipo inteiro usado nos cálculos exatos.
- [jsPDF — API oficial](https://parallax.github.io/jsPDF/docs/jsPDF.html): escrita de texto, novas páginas e exportação.
- [PDF.js — exemplos oficiais](https://mozilla.github.io/pdf.js/examples/): renderização das páginas utilizada apenas para conferir o PDF de teste.
