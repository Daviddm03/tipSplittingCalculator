# Auditoria técnica — Tip Splitting Calculator

Data: 18 de setembro de 2026. Escopo: leitura integral dos três arquivos originais, refatoração conservadora, testes locais e análise de produto. As recomendações abaixo **não foram implementadas**. Nenhum commit, push ou deploy foi realizado.

## 1. Resumo executivo

A aplicação tem um fluxo principal funcional e uma apresentação visual coerente. É uma base válida de projeto Junior Frontend: demonstra DOM, eventos, seleção e filtros, navegação, validação e PDF sem depender de um framework.

**Ainda não está pronta para distribuir gorjetas reais segundo a regra informada.** Divide igualmente por pessoa, não por dias trabalhados. O arredondamento exibido não garante a conservação do total. O histórico do navegador pode apresentar resultado antigo após reset e causar erro no PDF. A seleção individual não funciona por teclado. Não existe histórico de distribuições nem persistência.

Prioridades: decidir a regra dos centavos e dos dias; tornar cálculo/estado/navegação consistentes; apresentar e exportar a distribuição individual; resolver acessibilidade e validar mobile; depois adicionar persistência proporcional ao uso e documentação de portfólio.

A limpeza removeu 39 linhas e adicionou 6 em `script.js`. HTML e CSS ficaram idênticos. O comportamento observado antes/depois foi equivalente, inclusive nos defeitos preexistentes. Isso comprova o escopo da refatoração, não a correção completa do produto.

## 2. Arquitetura atual

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Splash, formulário, seleção, revisão, animação de cálculo e resultado; carrega fontes, CSS, jsPDF e código da aplicação. |
| `script.js` | Referências DOM, estado em memória, navegação, validações, cadastro fixo, seleção/filtros, renderização, cálculo, PDF e reset. |
| `style.css` | Aparência, visibilidade, animações, grids, listas com scroll e media queries em 480/768 px. |

Não há package.json, scripts npm, build, módulos, assets locais adicionais, README, licença explícita ou testes versionados. Não foram encontrados AGENTS.md nos diretórios inspecionados. O Git estava limpo no início.

Dependências externas: Inter via Google Fonts e jsPDF via `https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js`. Nesta execução, o navegador carregou jsPDF **4.2.1**; `latest` não fixa essa versão para o futuro.

Fluxo: input e período → `selectedEmployees` → `updateReviewSummary()` / `renderReviewEmployees()` → `calculateDistribution()` → `calculationResult` → `showResult()` → `generatePDF()` ou `resetCalculation()`.

`navigateTo()` grava `{screen}` com `history.pushState`; `showScreen()` altera classes; `popstate` reapresenta a tela registrada. Animações são controladas separadamente, por intervalos.

Cadastro: **63 colaboradores**, objetos `{name, role, outlet}`, sem ID. Dez outlets derivados com Set, na ordem do cadastro: Sky Bar (7), Wine Bar 1638 (6), Wine & Jazz (6), Pool Bar (5), Restaurante 1638 (7), Restaurante Boa Vista (6), Cozinha 1638 (6), Cozinha Central (Boa Vista) (6), Housekeeping (6) e Eventos (8). Não há nomes repetidos no cadastro atual. Cargo e outlet não alteram o cálculo.

## 3. Refatorações realizadas

Todas as alterações de aplicação estão em `script.js`.

| Problema | Mudança e motivo | Risco |
| --- | --- | --- |
| `app` e `calculationScreen` consultavam o mesmo elemento | Mantida uma referência, usada também ao concluir a splash. | Baixo; mesmo nó DOM. |
| `goToEmployeeSelection()` apenas encaminhava uma chamada | Substituída pela chamada direta `navigateTo("employees")`. | Baixo; mesmos argumentos e momento. |
| Objeto `screens` nunca utilizado | Removido. | Baixo; sem consumidores. |
| Reset repetia operações de `clearPeriodError()` | Reutilizado o helper existente. | Baixo; mesmos efeitos. |
| `selectedOutlets` continha todos os outlets | Renomeado para `outlets`, sem modificar dados ou ordem. | Baixo; referências atualizadas. |
| Clique em outlet repetia filtro existente | Reutilizado `getVisibleEmployees()` após atribuir `selectedOutlet`. | Baixo; mesma comparação e ordem. |
| Logs e comentário duplicado | Removidos sete `console.log` e comentário redundante do painel. | Baixo; removido apenas diagnóstico no console. |

`docs/auditoria-tecnica.md` registra a entrega solicitada. Não foram criadas pastas de processo, abstrações novas ou dependências.

## 4. O que foi preservado

Identidade, cores, fonte, layout, espaçamentos, animações, duração dos timers, textos visíveis, fluxo, hash/histórico, validações, formatação monetária, fórmula, cadastro, outlets, seleção, PDF e reset. `index.html` e `style.css` não foram modificados. Os corpos de `calculateDistribution()` e `generatePDF()` permanecem iguais.

A regra de dias não foi implementada. Não se alteraram arredondamento, UX ou persistência. Os defeitos de navegação foram documentados para correção específica, com critérios claros, evitando ampliar esta limpeza para mudança de produto.

## 5. Código removido

Removidos: objeto sem uso `screens`, alias DOM duplicado, wrapper de navegação, bloco redundante de limpeza de erro, filtro duplicado, sete logs e comentário duplicado.

Nenhum colaborador, outlet, arquivo de aplicação, asset ou regra CSS foi removido. O CSS tem duplicações: `.employee-header` reaparece com o mesmo bloco; `.outlet-list button.active` aparece duas vezes e a segunda declaração muda o fundo; estilos de `.employee-header` e `.employee-actions` se sobrepõem. A primeira regra de active não deve ser apagada ou movida sem conferir a ordem relativa do hover. Não houve limpeza especulativa de CSS.

## 6. Regras de negócio atuais

Local: `calculateDistribution()` (`script.js`, linha 46) e `formatMoney()` (linha 386).

Seja T = `Number(tipsInput.value)` e N = `selectedEmployees.length`:

- Quota interna por colaborador: **q = T / N**.
- Retorno: `{totalTips: T, employeeCount: N, amountPerEmployee: q}`.
- Valor exibido/exportado: q formatado por `Intl.NumberFormat("en-US")`, com exatamente duas casas decimais.
- Não há pagamentos individuais armazenados, soma distribuída ou residual calculado.

A igualdade matemática N × q = T não garante que N pagamentos de q arredondado em centavos somem T:

| Total | Pessoas | Valor exibido por pessoa | Soma dos pagamentos exibidos | Total menos soma |
| --- | --- | --- | --- | --- |
| €100,00 | 3 | €33,33 | €99,99 | +€0,01 |
| €10,00 | 6 | €1,67 | €10,02 | −€0,02 |
| €0,01 | 3 | €0,00 | €0,00 | +€0,01 |
| €100,00 | 4 | €25,00 | €100,00 | €0,00 |

**A soma não corresponde sempre ao total.** Number também não conserva precisão de centavos em magnitudes arbitrárias.

Opções a decidir: distribuir os centavos restantes deterministicamente entre participantes, com desempate/rotação definido; manter residual explícito para conciliação; ou aplicar ajuste individual identificado. Para uso real, representar dinheiro em centavos inteiros dentro de limite seguro e escolher política que garanta `sum(pagamentos) === totalCentavos`. Explicar ao operador quem recebe o ajuste.

O cálculo atual serve como demonstração de divisão igual, mas **não é suficiente como registro de pagamentos confiável** e não corresponde à regra real dos dias. Nenhuma política monetária nova foi aplicada silenciosamente.

## 7. Evolução para dias trabalhados — não implementada

Manter o stack. Introduzir identidade estável para colaboradores e registrar dias na participação daquela distribuição. Um colaborador pode trabalhar quantidades distintas em meses diferentes.

Para dias dᵢ de cada participante: D = soma(dᵢ), valor diário v = T / D, quota teórica qᵢ = T × dᵢ / D. Exemplo: 20 + 18 + 10 = 48 unidades; parcelas 20T/48, 18T/48 e 10T/48. Não usar cargo, part-time ou peso: não fazem parte da regra informada.

Mudanças necessárias:

1. **Período:** armazenar ano/mês como dados e derivar o texto. Hoje o período é um mês inteiro; para intervalos futuros, definir início/fim e inclusão das datas.
2. **Seleção:** inserir campo de dias junto a cada participante selecionado na tela de colaboradores, com label que inclua o nome. Manter valor ao trocar de outlet; explicitar o efeito de desmarcar/reselecionar. Evitar preencher todos os dias do mês como se fossem dias efetivamente trabalhados.
3. **Validação:** exigir inteiro finito e não negativo, assumindo dias inteiros. Confirmar se frações de dia existem antes de aceitá-las. Limite superior inicial: quantidade de dias do mês, incluindo ano bissexto. Isso impede 32 dias em janeiro, mas não prova presença; se houver escala, limitar também aos dias elegíveis.
4. **Zero:** decidir se a pessoa permanece como registro de participação zero ou é excluída do pagamento. Bloquear divisão quando D = 0. Distinguir selecionados de participantes com dias positivos.
5. **Férias/faltas:** informar dias efetivos já descontados ou derivar de escala e ausências. Não descontar novamente se o operador informou dias líquidos. Definir folgas, entrada/saída no meio do mês e ausências sobrepostas antes de criar campos separados.
6. **Review:** mostrar nome, outlet, dias, total de dias e valor total; permitir corrigir sem perder rascunho. Alteração de período revalida todos os dias.
7. **Cálculo:** receber dados explícitos, validar invariantes e devolver pagamentos em centavos, dias totais, versão da regra e ajustes. Uma opção monetária é piso das quotas e distribuição do residual pelas maiores frações, com desempate previamente aprovado.
8. **Resultado:** substituir a premissa de valor único igual por pessoa por lista conferível de dias/valores e soma distribuída. É mudança futura de produto, não refatoração neutra.
9. **PDF/histórico:** usar a mesma fotografia imutável do resultado; exportar nome, outlet, dias, valor, total e política de centavos. Edição posterior do cadastro não pode mudar distribuição antiga.

Aceitação: 20/18/10; mês de 28/29/30/31 dias; zero/todos zero; dias negativos/fracionários/excedentes; mudança de mês; filtros; edição na revisão; empate de resíduos; igualdade exata entre total e pagamentos.

## 8. Estado e navegação

| Dado | Origem atual |
| --- | --- |
| Total | `tipsInput.value`, relido na revisão e no cálculo. |
| Período | `selectedYear` / `selectedMonth`; revisão, resultado e PDF leem `selectedPeriod.textContent`. |
| Seletor | `pickerYearValue`, `isPeriodPickerOpen`, estilo inline e classes dos meses. |
| Seleção | `selectedEmployees`, por identidade dos objetos; `selectedOutlet` é filtro. |
| Resultado | `calculationResult`: total, quantidade e quota igual. |
| Tela | `history.state.screen` e classes; animação fica fora desse modelo. |

Problemas confirmados:

- Calcular → novo cálculo → Back: hash volta a `#result`, DOM mostra €33,33, mas `calculationResult` é null. PDF lança TypeError ao ler `totalTips`.
- Back durante animação leva a `#employees`, mas o timer continua e impõe `#result` ao terminar.
- Reload perde valor/seleção; `replaceState` substitui rota atual por `#calculation`. Link direto com hash não restaura distribuição.

Constatações adicionais por código:

- `popstate` só muda visibilidade, sem validar estado ou atualizar resumo/lista. Voltar ao formulário, editar e avançar pelo histórico pode mostrar revisão antiga; calcular lê dados atuais, diferentes dos revisados. Esse caminho específico não foi executado integralmente.
- Reset limpa modelo principal, erros, filtro e seleção, mas não todos os textos de review/result, ano de navegação do picker, estado aberto/seta ou barra de cálculo.

Recomendação: rascunho simples como fonte de dados, resultado separado e validado, entrada em telas com pré-condições e recomposição, invalidação do resultado quando o rascunho muda e cancelamento de timer ao sair. Não exige biblioteca de estado. Separar histórico de navegação de histórico de distribuições.

## 9. Validações e edge cases

| Caso | Comportamento atual / evidência |
| --- | --- |
| Período ausente | Submit mostra erro e não avança; testado. |
| Total vazio ou zero | JS rejeita; zero é permitido pelo `min=0`, mas barrado pelo submit. |
| Negativo | `min=0` torna o input nativamente inválido; JS também verifica `<=0`. |
| Mais de duas casas | `step=0.01` bloqueia submit nativo; `100.005` teve `checkValidity() === false`. A função de cálculo sozinha aceita. |
| Nenhum selecionado | Continuar impede; testado. Cálculo direto retorna Infinity para total positivo ou NaN para zero. |
| Duplicidade | Clique/SELECT ALL evita repetir a mesma referência. Não há ID/validação de duplicidade lógica para futuro cadastro/importação. |
| Notação exponencial | `1e20` é aceito no Chrome testado, sem precisão monetária suficiente. Não há teto. |
| Overflow numérico | `1e309` foi sanitizado para vazio pelo Chrome. Isso não substitui `Number.isFinite` na fronteira do cálculo. |
| Período extremo | Anos crescem/decrescem sem limite; validação só verifica null. Período não participa do cálculo atual. |
| Dados inválidos | Cadastro fixo, sem schema; futura importação exigirá campos, IDs e duplicações validados. |

O parse usa Number, sem parser monetário localizado. Vírgula, colagem formatada e teclado decimal dependem de navegador/locale e exigem teste real. A apresentação é inglesa (1,234.56), com € adicionado separadamente; preservada.

## 10. PDF

Local: `generatePDF()` (`script.js`, linha 59). Usa jsPDF, página padrão A4 retrato, Helvetica e posições fixas. Contém título, período, total, número de colaboradores, quota igual e rodapé. **Não contém nomes, cargos, outlets, pagamentos individuais, dias, ID da distribuição ou total efetivamente distribuído.** Não há necessidade atual de paginação porque não há lista.

Foi gerado e baixado `tip-splitting-january-2026.pdf`, 4.188 bytes, antes/depois. Conteúdo igual, exceto data de criação e ID automático. Isso confirma preservação do gerador e download no Chrome headless desktop.

As posições fixas dão margens e hierarquia simples ao exemplo normal. Não houve renderização visual do PDF em leitor: Poppler não foi localizado e Python não estava disponível pelo comando consultado. Não afirmar legibilidade/glyphs universalmente verificados. Pendentes: símbolo €, nomes acentuados quando adicionados, valores longos, impressão e download/abertura em Safari/iOS e Android.

Fragilidades: usa `window.jspdf` e `calculationResult` sem guardas; não há mensagem/tratamento de erro. Período vem do DOM atual e valores vêm do resultado, permitindo mistura se o estado mudar. `latest` e rede tornam a execução dependente de terceiros. O mesmo mês gera o mesmo nome de arquivo, sem identidade de distribuição.

Evolução: PDF a partir do snapshot; tabela colaborador/outlet/dias/valor, soma e ajustes; paginação quando houver lista; testar 63 nomes e totais extremos. Sem redesign nesta etapa.

## 11. Histórico e persistência

**Não existem.** Não há código de localStorage, sessionStorage, IndexedDB ou backend. No perfil de teste ambos os storages estavam vazios. O histórico de hash guarda apenas a tela.

Para uso individual, localStorage pode bastar para poucos registros JSON. Proposta futura: `id`, `createdAt` ISO, `schemaVersion`, `ruleVersion`, período estruturado, total em centavos, participantes com ID/nome/outlet/dias/valor em centavos, dias totais, soma distribuída e política/ajustes de arredondamento. Guardar cópia dos dados apresentados, não referências ao cadastro atual.

Separar rascunho recuperável de distribuição finalizada. Prever lista, detalhes, reexportação do mesmo resultado, exclusão consciente e exportação/importação de backup. Validar JSON/versões e tratar storage indisponível/quota excedida. Não sobrescrever silenciosamente registros inválidos.

localStorage depende da origem e navegador, não sincroniza dispositivos e pode ser apagado. Mudar domínio também muda o armazenamento acessível. Aceitável para uso local pequeno se explícito, com backup. Backend passa a fazer sentido com múltiplos operadores/dispositivos, compartilhamento, permissões, backup central ou rastreabilidade confiável. Não é requisito automático.

## 12. UX por etapa

- **Splash:** identidade consistente; percentual artificial dura aproximadamente três segundos, mais atrasos/transição, sem medir trabalho real. Não há cadastro remoto que o justifique. Avaliar retorno versus espera; mantida.
- **Período:** mês/ano e feedback reconhecíveis. Fecha ao selecionar mês ou clicar novamente no botão, não com Escape ou clique fora. Testado: mostrando 2027, JAN continua marcado da seleção de janeiro/2026. Em 320×568 termina abaixo da dobra; exige scroll, sem provar perda de acesso.
- **Total:** € e placeholder orientam. Erro genérico; não explica máximo/localização decimal. `type=number` não garante teclado decimal uniforme em mobile.
- **Colaboradores:** outlets, contador e seleção entre filtros funcionam. SELECT ALL atua no filtro e também desmarca visíveis, mas texto não muda. Não informa quantos selecionados estão fora do filtro. Scroll horizontal e interno são intencionais, mas podem exigir descoberta.
- **Review:** confere período, total, quantidade, nomes e cargos. Não mostra outlet/valores individuais, nem oferece editar/voltar. Correção depende do histórico, vulnerável a resumo antigo.
- **Cálculo:** três segundos de espera para divisão síncrona; timer pode contrariar navegação. Barra não é explicitamente zerada antes do próximo cálculo.
- **Resultado:** quota e ações claras. Conclusão não revela residual nem lista de pagamentos. Novo cálculo limpa rascunho imediatamente, sem preservação/histórico.

CTAs e títulos geralmente esclarecem o próximo passo. Posição no fluxo depende dos títulos, sem indicador de etapas. Evitar perda de dados e permitir volta segura têm prioridade sobre adicionar stepper.

## 13. Responsividade

### Confirmado no navegador

Chrome headless, altura 900 px, larguras 320/375/768/1024/1440. Quatro telas renderizadas por largura. Para medir cada tela foi usada `showScreen()`; fluxo normal foi exercitado separadamente. É viewport desktop emulada, não aparelho móvel.

| Largura | clientWidth inicial/resultado | clientWidth seleção/review |
| --- | --- | --- |
| 320 | 320 | 305 |
| 375 | 375 | 360 |
| 768 | 768 | 753 |
| 1024 | 1024 | 1009 |
| 1440 | 1440 | 1425 |

O deslocamento por scrollbar **ainda existe**: 15 px nas telas mais altas. Não há `scrollbar-gutter` ou reserva consistente. `body.loading` nunca é removida e mantém `overflow:hidden`; contudo, no Chrome testado o elemento raiz ainda apresenta scrollbar. Não é correto inferir pelo CSS que toda rolagem está bloqueada.

Nas medições não houve overflow horizontal global; botões de outlets fora da viewport pertencem ao scroller horizontal intencional. Inspecionadas capturas de inicial/review/seleção em 320 px e resultado em 1440 px. Oito PNGs antes/depois, quatro telas em 320/1440, são idênticos byte a byte.

Em 320×568: picker começa em y≈401 e termina em y≈618; documento tem 697 px de altura. Parte fica abaixo da dobra. Há CSS mobile próprio para seleção, review e resultado. Em `.result-actions`, declarações gerais posteriores sobrescrevem `grid-column`/`align-items` do media query; existe conflito de cascata, sem dano visual específico comprovado.

### Testes manuais pendentes

Touch, scroll aninhado, teclado virtual, Safari/Firefox, orientação horizontal, alturas pequenas em todas as telas, zoom 200–400%, texto aumentado, fonte lenta/indisponível, totais longos, todos os colaboradores na revisão e transições após scroll. Validar futura correção de gutter na splash/seletor/telas. Não há alegação de aprovação visual completa em mobile.

## 14. Acessibilidade

Barreiras reais, mantidas para correção específica:

- `renderEmployees()` cria DIV clicável, sem tabindex/papel/estado; medido `tabIndex=-1`. Seleção individual não operável por teclado. Priorizar checkbox nativo com label e aparência preservada tanto quanto possível.
- Filtros e SELECT ALL removem outline sem foco alternativo. Campo monetário/período indicam foco por borda de baixo contraste.
- Label PERIOD não associado ao botão; seletor não anuncia expandido/fechado; setas de ano sem nomes descritivos. Picker é popover, não modal implementado: escolher semântica coerente, Escape/retorno de foco; trap só se realmente modal.
- Erros sem `aria-describedby`/`aria-invalid`; nenhuma live region para contador, erro, progresso ou resultado.
- Troca de tela não gerencia foco/anúncio. Durante splash, formulário escondido apenas por opacidade pode continuar no percurso de teclado.
- Sem `prefers-reduced-motion`; animações e espera permanecem.
- `lang=en` combina com a interface; cargos em português não têm indicação específica de idioma.

Contrastes calculados: #8C4A3C sobre #0D0D0D ≈ **2,92:1**, #777 sobre #0D0D0D ≈ **4,34:1**, #666 sobre #080808 ≈ **3,49:1**. Textos pequenos nessas combinações ficam abaixo de 4,5:1. Texto escuro dos botões sobre terracota também tem 2,92:1. Cores preservadas por instrução; ajuste deve ser explícito.

Setas são 32×32 e filtros mobile têm min-height 44. Não classificar todo alvo menor que 44 como falha automática WCAG AA: critério 2.5.8 usa 24×24 e exceções de espaçamento. SELECT ALL tem área pequena; medir alvo/contexto ao corrigir.

Referências: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [foco visível](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible), [contraste mínimo](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum). Revisão de barreiras, não certificação de conformidade.

## 15. Segurança e robustez

**Não foi encontrado caminho atual de XSS por entrada do usuário.** innerHTML apenas limpa containers com string vazia; nomes/cargos entram por textContent. PDF usa `pdf.text`, sem converter HTML de usuário. Não há credenciais, API de negócio ou transmissão implementada de valores/seleção.

Riscos concretos: scripts externos acessam a página; `@latest` não é reprodutível; ausência de integrity; rede necessária para PDF/fonte; cadastro fica público no JavaScript publicado. Confirmar adequação de publicar nomes antes do portfólio. Não assumi quais são reais/fictícios e não os alterei.

Não atribuo CVE sem correspondência entre versão e API vulnerável. Consultar [segurança oficial do jsPDF](https://github.com/parallax/jsPDF/security) e [releases](https://github.com/parallax/jsPDF/releases) ao fixar versão. Avisos de APIs HTML/Node não demonstram exploração neste uso browser com texto estático.

Robustez insuficiente: cálculo sem guardas locais, resultado nulo no PDF, período duplicado entre DOM/variáveis, ausência de snapshot e tratamento de falhas. Futuro storage/importação exige validação; hoje essa superfície não existe. Fixar/servir localmente jsPDF e comunicar falhas de exportação, sem backend por reflexo.

## 16. Performance

63 colaboradores e filtros lineares são proporcionais. Reconstruir essa lista é aceitável. Handlers de nós substituídos não demonstram leak por si só: não foi encontrado acúmulo de referências que os mantenha vivos. Não se justifica virtualização ou framework.

Pontos relevantes: fonte/jsPDF externos; script jsPDF bloqueia o script seguinte enquanto carrega; timers artificiais atualizam DOM cem vezes; cálculo não cancela timer ao navegar. Cliques repetidos/programáticos não têm trava e podem criar intervalos concorrentes; sobreposição visual reduz a chance normal, portanto não afirmar duplo clique real reproduzido.

Não há imagem pesada local. Recriar Intl.NumberFormat tem custo, mas poucas chamadas não justificam prioridade. Medir rede lenta antes de alterar carregamento. Nenhum perfil prolongado de memória/CPU foi realizado.

## 17. Sinais de vibe coding

Evidências de decisões incompletas/acumuladas, **não prova de autoria por IA**. JS/CSS puros e simplicidade não são problemas.

| Local | Problema | Por que parece pouco intencional | Como melhorar |
| --- | --- | --- | --- |
| Antigo `screens`, alias `app`, logs | Resíduos sem função de produto | Estrutura iniciada sem uso; diagnóstico permanente. | Removidos. |
| Navegação e timers | Hash, estado visual, resultado e animação independentes | Voltar/reset contradizem tela. | Pré-condições, invalidação e timer cancelável. |
| Cálculo/resultado | Conclusão sem conciliação | Demo funciona, pagamentos não fecham. | Política explícita e invariantes monetárias. |
| CSS | Blocos repetidos/sobrescritas | Remendos de cascata sem consolidar intenção. | Limpeza própria com estilos computados e capturas. |
| `body.loading` | Adicionada e nunca removida | Estado transitório permanente. | Definir ciclo de vida e testar scroll. |
| `selectedOutlets` | Nome de seleção para catálogo | Mistura conceitos de filtro/dados. | Renomeado para `outlets`. |
| Picker | Ano visível e mês marcado discordam | Resolvido só para seleção imediata. | Destaque por ano e mês. |
| Cadastro | Sem IDs/origem documentada | Identidade só funciona com os mesmos objetos em memória. | IDs estáveis e explicar dataset. |
| PDF/resultado | Resumo sem participantes | Demonstra exportação, sem conferir pagamento individual. | Snapshot/tabela auditável na evolução. |

Não há botão de histórico prometendo funcionalidade vazia: histórico não foi implementado. Não há evidência suficiente para afirmar mistura deliberada de dados fake e reais.

## 18. O que já está bom e não devemos mexer

Preservar HTML/CSS/JavaScript, hierarquia visual, tipografia e organização por etapas. O problema não exige reconstrução.

Fundamentos positivos: funções nomeadas de cálculo/resultado/PDF/reset, meses legíveis, textContent, Set para outlets, seleção preservada entre filtros, prevenção de duplicatas por referência, SELECT ALL limitado ao filtro, validação antes de avançar, Intl e media queries específicas.

PDF pequeno/compreensível. Ausência de servidor é apropriada para uso individual. Loops simples e 63 linhas são aceitáveis. Fechar invariantes e estados tem mais valor que multiplicar camadas.

Visão Senior: base compreensível, mas acoplamento ao DOM fragiliza consistência e teste. Bloqueadores: pagamentos, regra real ausente, retorno/reset inconsistente e seleção inacessível. Há underengineering nessas fronteiras e resíduos CSS, não necessidade de arquitetura enterprise.

## 19. Visão de recruiter

Em 2–5 minutos, comunica cuidado visual, domínio inicial do DOM e problema mais concreto que calculadora aritmética. Equipe/outlets, revisão e PDF diferenciam a apresentação.

No GitHub, ausência de README impede entender contexto, execução, regra, decisões e limites. Sem testes versionados e com centavos/navegação frágeis, um Senior pode enxergar protótipo visual mais concluído que a lógica de produção. Não foi inspecionada URL publicada nem histórico completo do Git; avaliação baseada no conteúdo local.

Para candidatura Junior, demonstrar regra real explicada, pagamentos reconciliados, edge cases testados, acessibilidade e decisões honestas aumenta muito o valor. Não atribuo nota nem recomendo tecnologia nova só para parecer avançado.

## 20. Melhorias recomendadas

| Prioridade / melhoria | Impacto | Esforço | Risco |
| --- | --- | --- | --- |
| P0 — Política de centavos e conservação do total | Alto | Médio | Alto: altera pagamentos. |
| P0 — Dias trabalhados de ponta a ponta | Alto | Grande | Alto: altera regra/produto. |
| P0 — Navegação/reset e invalidação de resultados | Alto | Médio | Médio |
| P0 — Seleção individual por teclado | Alto | Médio | Médio |
| P1 — Cancelar timer ao sair e bloquear concorrência | Alto | Pequeno | Médio |
| P1 — Finitude, precisão, teto, período e IDs | Alto | Médio | Médio |
| P1 — Resultado/PDF individual e reconciliado | Alto | Médio | Médio |
| P1 — Fixar jsPDF e tratar falhas | Alto | Pequeno | Médio |
| P1 — Contraste, foco, erros e anúncios | Alto | Médio | Médio: cores exigem decisão. |
| P1 — Scrollbar e mobile real | Médio | Médio | Médio |
| P1 — Histórico local/backup conforme uso | Alto | Médio | Médio |
| P1 — README, demonstração e testes relevantes | Alto | Médio | Baixo |
| P2 — Picker: ano/destaque/Escape/fechamento | Médio | Pequeno | Baixo |
| P2 — Consolidar CSS com comparação visual | Baixo | Pequeno | Médio |
| P2 — Espera artificial e textos ambíguos | Médio | Pequeno | Médio: decisão de UX. |

Risco é da mudança, não gravidade do defeito. Regras de negócio precisam de critérios explícitos antes de implementar.

## 21. Quick wins

Fixar jsPDF testado; mensagem de falha de PDF; cancelar timer ao abandonar cálculo; corrigir destaque do mês ao mudar ano; nomes acessíveis das setas e associação de erros; README com execução/limitações; poucos testes de centavos/estado. São próximas tarefas, não alterações aplicadas.

Persistência e regra de dias completa não são quick wins. Teto monetário deve corresponder ao uso real, sem número arbitrário silencioso.

## 22. O que não vale a pena fazer

Não migrar automaticamente para React/Next.js/TypeScript. Não adicionar Redux/Zustand, autenticação, API, microservices, banco ou design system para este escopo. Não criar suíte E2E gigante, virtualização de 63 colaboradores ou abstração para cada repetição.

Não fazer redesign antes de corrigir cálculo/estado, apagar CSS por suspeita, implementar pesos/cargos/part-time inexistentes na regra, nem adicionar backend só para incrementar CV.

## 23. Roadmap até produção

1. Confirmar unidade, período, zero dias, ausências, limites e política de centavos; exemplos de aceitação.
2. Cálculo independente do DOM, centavos, validação e testes pequenos; IDs e snapshot.
3. Integrar dias em seleção/review/resultado; corrigir navegação, invalidação, reset e timers.
4. PDF da mesma distribuição, com lista, totais, paginação e tratamento de falhas.
5. Corrigir teclado, foco, contraste, picker e scrollbar; testar dispositivos, alturas e reduced motion.
6. Se o uso exigir registros, adicionar histórico local, rascunho recuperável e backup com schema e falhas tratados.
7. Fixar dependências e fazer aceite com casos reais anonimizados: total/dias conferidos, soma exata, PDF consistente. Depois considerar publicação final.

Pronto significa: nenhuma distribuição com entrada inválida; nenhum resultado antigo apresentado como atual; soma exata em centavos; mesma distribuição em tela/PDF/histórico; teclado/mobile utilizáveis; limites de persistência explícitos.

## 24. Roadmap para portfólio

Documentar problema real, contexto, matemática, arquitetura pequena, arredondamento, edge cases e trade-offs. README: execução, tecnologias, screenshots desktop/mobile, demo e limitações; definir licença e adequação dos nomes publicados.

Versionar pequena suíte que prove dias, resíduos, edição/reset/navegação e consistência de exportação. Mostrar PDF de exemplo e histórico se implementado. Não afirmar persistência quando só existe hash.

Diferenciais fortes: dias efetivamente trabalhados, conciliação auditável, outlets, review corrigível, PDF individual e recuperação de distribuições. A tecnologia simples permite explicar tudo em entrevista. Preparar demonstração curta do problema ao documento final e registrar claramente o trabalho realizado pelo desenvolvedor.

## 25. Verificações executadas

### Passaram

- Leitura integral dos três arquivos antes de editar.
- `node --check script.js` antes/depois; `git diff --check` sem erros.
- Roteiro temporário com Node 24.18.0, HTTP loopback e Chrome headless instalado, perfil separado. Nenhum pacote instalado no projeto.
- **12 verificações de caracterização antes/depois:** cadastro 63/10; formulário vazio; navegação; seleção vazia; três selecionados; selecionar/desmarcar outlet preservando outros; revisão; divisão; nome PDF; reset; reload.
- PDF real gerado/baixado antes/depois com jsPDF 4.2.1; conteúdo igual, descontando metadados variáveis.
- Cadastro completo, edge cases, métricas de 20 combinações tela/largura e estados de reset equivalentes.
- Oito screenshots (quatro telas × 320/1440) idênticos byte a byte; inspeção visual das quatro capturas citadas na seção 13.
- Monitoramento de exceções JS/falhas de carregamento de rede: nenhum evento no fluxo normal. Logs de desenvolvimento removidos. Não houve inspeção manual da aba Console do DevTools.
- Revisão independente do diff não encontrou alteração de comportamento introduzida.

### Defeitos reproduzidos / critérios que não passam

- Pagamentos exibidos de €100/3 e €0,01/3 deixam residual.
- Reset → Back mostra resultado antigo com estado nulo; PDF falha com `TypeError: Cannot read properties of null (reading 'totalTips')`. Erro capturado propositalmente pelo roteiro; não contradiz log vazio do fluxo normal.
- Back durante animação volta aos colaboradores, mas timer força resultado.
- Picker mostra 2027 com JAN de 2026 destacado; Escape não fecha.
- Scrollbar varia clientWidth em 15 px nas cinco larguras.
- Colaboradores são DIV, tabindex −1, sem role; picker sem aria-expanded; input sem associação de erro; nenhuma live region.
- Extremos expõem falta de teto/precisão; cálculo direto sem colaboradores retorna Infinity. Nem todo valor inválido passa pelo submit normal.

### Limitações e falhas do ambiente

- Sandbox Windows falhou em execução, imagem e apply_patch (`helper_sandbox_lock_failed`, acesso negado). Usadas operações escaladas autorizadas.
- Navegador integrado falhou duas vezes com `trusted Node process exited unexpectedly`. Testes ocorreram no Chrome headless via DevTools, cliques programáticos e DOM, não interação manual em aparelho real.
- Primeira edição abortou antes de gravar devido à codificação do € no PowerShell; repetida com escape Unicode e verificada.
- Teste adicional falhou inicialmente por aspas no próprio roteiro; corrigido e reexecutado com sucesso. Não era erro do app.
- Primeiro comando de gravação do relatório excedeu limite de tamanho do Windows; conteúdo foi gravado em partes no mesmo documento.
- Python indisponível pelo comando consultado e Poppler não localizado; PDF sem inspeção visual renderizada. Código, conteúdo e download verificados.
- Não havia nem foi adicionada suíte automatizada versionada, linter, package.json ou scripts. Não houve `npm test`, `npm run build` ou `npm audit` aplicáveis. Roteiros temporários não são infraestrutura permanente.
- Pendentes: PDF visual/impressão, leitor de tela, teclado/touch integral, Safari/Firefox, decimal por locale, offline/rede lenta e sessão longa de performance.

Evidências temporárias: `%TEMP%\tip-splitting-audit-20260918` (`audit.cjs`, `before.json`, `after.json`, `extra.cjs`, `extra.json`, PDFs e PNGs). Podem ser removidas pelo sistema; os resultados duráveis estão neste relatório. Para repetir enquanto existirem, da raiz: `node "$env:TEMP\tip-splitting-audit-20260918\audit.cjs" after`. Expectativas de ano/data são as desta auditoria.

A entrega termina nesta refatoração e neste relatório. Nenhuma recomendação de evolução foi implementada.
