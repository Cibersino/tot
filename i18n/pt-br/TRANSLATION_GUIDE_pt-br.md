# Guia específica de idioma — Português brasileiro (`pt-br`)

Esta guia específica deve ser lida junto com [`../TRANSLATION_GUIDE.md`](../TRANSLATION_GUIDE.md) e com o baseline semântico conjunto `es`/`en`. Ela registra decisões editoriais próprias do português brasileiro de toT.

Na revisão de `pt-br`, `es` é uma referência especialmente útil pela proximidade com o português brasileiro, mas não deve funcionar como fonte única nem como matriz de calco. As decisões devem ser verificadas contra `en`, contra o glosário global e contra a superfície real da key.

## 1. Modelo editorial do português brasileiro

Esta guia trata do português brasileiro (`pt-br`) como idioma pai do português em toT. Essa é uma decisão editorial e técnica: `pt-br` deve sustentar por si mesmo uma experiência completa da app, sem funcionar como uma camada provisória, neutra ou genérica.

A voz de `pt-br` deve ser clara, natural e tecnicamente precisa. A revisão deve aceitar formas brasileiras estáveis quando elas tornam a interface mais legível, precisa ou idiomática. Não é necessário substituir uma forma brasileira clara por uma alternativa supostamente mais neutra.

`pt-pt` existe como variante. Diferenças próprias do português europeu devem ser tratadas nessa variante, não antecipadas por meio de um `pt-br` esvaziado, artificialmente neutralizado ou preventivamente genérico.

O objetivo não é produzir coloquialidade marcada nem regionalismo por si só. Formas excessivamente locais, informais ou dependentes de uso regional estreito devem ser evitadas, salvo decisão documentada para uma superfície específica.

## 2. Tratamento do usuário

O português brasileiro da app usa tratamento direto, sem excesso de formalidade e sem coloquialidade desnecessária.

| Superfície                                    | Tratamento preferido                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Botões, menus, comandos e controles compactos | Infinitivo, substantivo ou frase curta: `Salvar`, `Carregar tarefa`, `Extrair texto`, `Preferências`.      |
| Estados, erros e bloqueios                    | Fórmulas descritivas ou impessoais: `Não foi possível carregar a tarefa.`, `Há uma extração em andamento.` |
| Instruções diretas                            | Imperativo compatível com `você`: `Escolha um arquivo`, `Verifique sua conexão`, `Tente novamente`.        |
| Confirmações                                  | Consequência ou ação formulada como pergunta direta: `Deseja continuar?`, `Substituir o texto atual?`.     |
| Textos longos de ajuda ou disclosure          | Prosa explicativa clara; `você` pode ser usado quando melhorar a leitura.                                  |

`Você` é a forma normal de tratamento direto quando a superfície pede segunda pessoa. Não usar `tu`, `vós`, `senhor`, `senhora` ou fórmulas cerimoniosas como voz geral da UI.

Evitar `por favor` como camada automática de polidez. Usar apenas quando a superfície realmente envolver espera, colaboração do usuário ou uma instrução que soe brusca sem essa marca.

Evitar construções pronominais artificiais ou excessivamente formais quando uma formulação direta for mais natural em português brasileiro de interface.

## 3. Léxico funcional

Estas formas não constituem um glosário completo; registram termos do português brasileiro de toT onde existe risco de drift ou uma decisão local relevante.

| Termo em `pt-br`                          | Uso                                                                                                                               | Notas / alternativas                                                                                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adicionar` / `adicionar ao texto atual`  | Conceito estável para somar conteúdo ao final do texto atual.                                                                     | Preferir em comandos e tooltips de append. `Acrescentar` pode explicar a ação em prosa, mas não deve substituir o termo estável sem decisão documentada. Evitar `anexar`. |
| `substituir` / `substituir o texto atual` | Conceito estável para trocar o texto atual por conteúdo entrante.                                                                 | Não usar `sobrescrever` como nome do conceito, embora a ação possa sobrescrever o conteúdo anterior.                                                                      |
| `texto atual`                             | Texto central carregado na janela principal.                                                                                      | Evitar `texto ativo`, `texto carregado`, `texto vigente`, `texto corrente` ou `documento atual` para esse conceito.                                                       |
| `extração de texto`                       | Fluxo para obter texto de arquivos.                                                                                               | Não substituir por `importação`, `carregamento` ou `abertura` quando a key se referir ao fluxo de extração.                                                               |
| `extração em lote`                        | Fluxo batch de planejamento, execução e relatório.                                                                                | Evitar `extração em massa`, `extração em bloco` ou `extração por lotes` como forma padrão.                                                                                |
| `item` / `itens`                          | Entrada processada dentro de uma unidade de extração em lote.                                                                     | Não forçar `arquivo` quando a entrada puder ser uma parte gerada ou outro insumo de processamento.                                                                        |
| `unidade`                                 | Contêiner de extração em lote.                                                                                                    | Usar para as unidades que agrupam itens. Evitar `grupo` quando a key nomear o conceito da app.                                                                            |
| `rota de extração`                        | Escolha ou resolução entre rota nativa e OCR.                                                                                     | Manter quando a superfície distingue caminhos de execução. `Método` só deve ser usado quando a superfície não precisar preservar essa distinção.                          |
| `rota nativa` / `nativa`                  | Rota local/não OCR.                                                                                                               | Usar `rota nativa` quando for necessário explicitar o conceito. `Nativa` é aceitável em labels compactos quando o contraste com OCR estiver visível.                      |
| `rota OCR` / `extração OCR`               | Rota ou processo de extração por OCR.                                                                                             | Usar `OCR` sozinho em labels compactos quando o contraste estiver claro. Não expandir para `reconhecimento óptico de caracteres` em UI comum.                             |
| `Ativar Google OCR`                       | Ação principal para ativar/autorizar a integração.                                                                                | Usar `ativar`, não `habilitar`, como forma padrão da ação de UI.                                                                                                          |
| `Desconectar Google OCR`                  | Ação principal para desconectar ou revogar o estado local da integração.                                                          | Usar `desconectar`, não `desligar`.                                                                                                                                       |
| `PDF de origem`                           | PDF original selecionado pelo usuário.                                                                                            | Preferir a `PDF fonte` em português brasileiro de UI.                                                                                                                     |
| `PDF gerado`                              | PDF derivado criado pela app.                                                                                                     | Usar para PDFs de páginas selecionadas ou partes geradas.                                                                                                                 |
| `PDF salvo`                               | PDF gerado mantido por decisão do usuário.                                                                                        | Não confundir com o PDF original.                                                                                                                                         |
| `linha`                                   | Entrada tratada como estrutura de tabela no Editor de Tarefas.                                                                    | Usar em ações como adicionar, mover, excluir, validar ou nomear linha. Não usar `fila` para table row.                                                                    |
| `leitura`                                 | Entrada tratada como conteúdo reutilizável ou salvo na biblioteca.                                                                | Usar em `Leitura`, `Salvar leitura na biblioteca`, `Carregar leitura na tarefa`, `Excluir leitura da biblioteca`.                                                         |
| `biblioteca de leituras`                  | Biblioteca de leituras reutilizáveis do Editor de Tarefas.                                                                        | Evitar `biblioteca` sozinha quando houver risco de ambiguidade.                                                                                                           |
| `tarefa`                                  | Plano de leitura do Editor de Tarefas.                                                                                            | Não usar para uma linha/leitura individual.                                                                                                                               |
| `cronômetro`                              | Ferramenta de medição de tempo.                                                                                                   | Evitar `temporizador`, que pode sugerir contagem regressiva.                                                                                                              |
| `Cronômetro Flutuante`                    | Nome da superfície flutuante do cronômetro.                                                                                       | Usar iniciais maiúsculas quando for nome da janela/superfície.                                                                                                            |
| `Editor de Texto`                         | Nome da janela de edição manual.                                                                                                  | Usar iniciais maiúsculas como nome de superfície.                                                                                                                         |
| `Editor de Tarefas`                       | Nome da janela de organização de tarefas.                                                                                         | Usar iniciais maiúsculas como nome de superfície.                                                                                                                         |
| `teste de velocidade de leitura`          | Fluxo guiado para medir velocidade real de leitura.                                                                               | Usar `Teste de velocidade de leitura` quando a superfície tratar como nome. Evitar `prova`.                                                                               |
| `tempo estimado de leitura`               | Duração calculada para ler o texto atual.                                                                                         | Usar quando a superfície precisar distinguir estimativa local da extensão ou do teste.                                                                                    |
| `velocidade de leitura`                   | Valor em WPM, configurado ou medido.                                                                                              | Distinguir velocidade configurada para estimativa e velocidade real medida por cronômetro/teste quando a superfície exigir.                                               |
| `preset de velocidade de leitura`         | Configuração salva de WPM.                                                                                                        | `Preset` é o termo estável; não substituir por `perfil`, `ajuste` ou `configuração` quando a key nomear o conceito.                                                       |
| `snapshot de texto`                       | Entidade de texto salva/carregável pela app.                                                                                      | Não traduzir como `captura de tela`, `print`, `cópia salva` ou `instantâneo`.                                                                                             |
| `pool do teste`                           | Conjunto local de arquivos disponíveis para o teste de velocidade de leitura.                                                     | Não substituir por `conjunto`, `banco` ou `coleção` quando a key nomear esse conceito.                                                                                    |
| `arquivos de teste`                       | Arquivos que alimentam o pool do teste.                                                                                           | Não confundir com testes automatizados de desenvolvimento.                                                                                                                |
| `testes incorporados` | Arquivos iniciais incluídos com a app para o teste. | Preferir `incorporados` como forma padrão; `embutidos` pode soar mais técnico ou menos natural para essa superfície. |
| `modo preciso`                            | Modo de contagem baseado em segmentação precisa.                                                                                  | Usar como termo estável da UI.                                                                                                                                            |
| `repetições de colagem`                   | Quantidade de iterações de colagem do texto da área de transferência.                                                             | Não usar `repetições de paste` em UI visível.                                                                                                                             |

## 4. Empréstimos e termos externos

Estas formas são usadas em `pt-br` quando a decisão local é conservar, limitar ou adaptar um empréstimo, tecnicismo, token externo ou forma não plenamente portuguesa.

| Termo             | Uso em `pt-br`                                                                                   | Nota                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`             | Usar como forma normal de produto.                                                               | `Aplicativo` pode ser usado em registros mais formais, legais ou explicativos se melhorar a superfície.                                                   |
| `build`           | Reservar para artefato ou versão técnica da app.                                                 | Não traduzir mecanicamente como `compilação` se soar artificial na superfície.                                                                            |
| `feedback`        | Usar como rótulo breve quando já estiver estabelecido.                                           | Não converter em termo geral automático para novas superfícies; se aparecer em outro contexto, decidir segundo a função concreta.                         |
| `layout`          | Evitar em UI de usuário; permitir em documentação técnica ou quando a superfície já for técnica. | Em copy visível, preferir `visual`, `disposição`, `organização` ou resolver por contexto.                                                                 |
| `pool`            | Usar como empréstimo técnico no conceito `pool do teste`.                                        | Não substituir por `conjunto`, `banco` ou `coleção` quando a superfície depender desse conceito.                                                          |
| `preset`          | Usar como empréstimo técnico.                                                                    | Distingue uma configuração salva de velocidade de leitura frente a `ajuste`, `perfil`, `configuração` ou `predefinição`.                                  |
| `Skins`           | Usar `Skins` enquanto a seção permanecer WIP.                                                    | A terminologia definitiva dessa superfície deve ser decidida junto com a implementação correspondente.                                                    |
| `snapshot`        | Usar como empréstimo técnico no conceito `snapshot de texto`.                                    | Evita confusão com `captura de tela` ou `print`.                                                                                                          |
| `spoiler`         | Usar como empréstimo funcional.                                                                  | Designa a função que oculta o segmento final do preview. Não traduzir como `revelação`, `final` ou `ocultação de prévia` sem nova decisão.                |
| `Toggle DevTools` | Conservar como rótulo técnico protegido do menu de desenvolvimento.                              | Não estender `toggle` como termo geral de UI; em superfícies de usuário preferir `ativar/desativar`, `mostrar/ocultar` ou `alternar` conforme o contexto. |
| `token`           | Usar como empréstimo técnico em contextos OAuth/autorização.                                     | Pode ser explicado como estado local de autorização ou sessão quando a superfície exigir.                                                                 |
| `tooltip`         | Evitar em copy comum de usuário, salvo quando a própria superfície falar de tooltips.            | Preferir `dica`, `rótulo`, `descrição`, `ajuda` ou a ação concreta.                                                                                       |
| `WIP`             | Usar apenas como token técnico protegido em superfícies temporárias.                             | Não estender como estilo final de usuário.                                                                                                                |
| `DevTools`        | Manter como nome técnico.                                                                        | Não traduzir nem recasar.                                                                                                                                 |

## 5. Convenções formais do português brasileiro

Estas convenções regem a revisão dos strings do bundle `pt-br`.

| Aspecto              | Convenção                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nomes de superfícies | Usar iniciais maiúsculas para nomes estabilizados: `Editor de Texto`, `Editor de Tarefas`, `Cronômetro Flutuante`.                                                                                                                         |
| Conceitos comuns     | Usar minúsculas quando não forem nome de superfície: `texto atual`, `snapshot de texto`, `extração em lote`, `biblioteca de leituras`.                                                                                                     |
| Botões e comandos    | Preferir infinitivo, substantivo ou frase curta em caixa de frase: `Salvar`, `Carregar tarefa`, `Restaurar presets padrão`. Não usar Title Case artificial.                                                                                |
| Títulos de seção     | Usar maiúsculas sustentadas apenas quando o design usa a string como rótulo visual de seção.                                                                                                                                               |
| Alertas breves       | Frases completas normalmente fecham com ponto: `Tarefa salva.` Frases nominais compactas podem omitir ponto conforme a superfície.                                                                                                         |
| Labels com valor     | Usar dois-pontos quando introduzem valor imediato: `Arquivo:`, `Velocidade:`, `Tempo decorrido: `.                                                                                                                                         |
| Elipses              | Usar `...` em estados de progresso, espera e placeholders visuais, salvo decisão tipográfica transversal futura.                                                                                                                           |
| Aspas                | Usar aspas duplas retas para nomes dinâmicos quando ajudarem a delimitar o valor; em JSON, escapar como `\"{name}\"`. Não aplicar mecanicamente a números, unidades, caminhos, códigos, porcentagens ou valores já apresentados por label. |
| Compostos e hífen    | Usar hífen quando fizer parte da forma lexical normal ou de um termo técnico estabilizado. Não criar compostos artificiais por calco do inglês.                                                                                            |
| Abreviações          | Evitar abreviações novas em UI de usuário se não houver restrição real de layout.                                                                                                                                                          |

## 6. Escolhas brasileiras estáveis

Quando a diferença for apenas variante brasileira versus europeia, usar a forma brasileira estável, salvo exigência concreta da superfície.

| Usar em `pt-br`                                                   | Evitar como padrão                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `arquivo`                                                         | `ficheiro`                                                     |
| `usuário`                                                         | `utilizador`                                                   |
| `tela` para screen; `janela` para window                          | `ecrã`                                                         |
| `salvar`                                                          | `guardar` para save                                            |
| `carregar`                                                        | `abrir` quando a ação real for carregar estado/conteúdo na app |
| `pasta` em UI comum                                               | `diretório` em copy comum de usuário                           |
| `área de transferência`                                           | `clipboard` em copy comum                                      |
| `ativar` / `desativar`                                            | `habilitar` / `desabilitar` como padrão automático             |
| `conectar` / `desconectar`                                        | `ligar` / `desligar` para conectividade da app                 |
| `excluir` para delete de objeto salvo ou persistente              | `eliminar` como padrão de UI                                   |
| `remover` quando a ação só tira algo de lista, relação ou seleção | `excluir` para remoção não destrutiva                          |
| `visualizar`, `prévia` ou `visualização` conforme contexto        | `pré-visualizar` como padrão automático                        |
| `atualizar` / `atualização`                                       | `upgrade` em UI comum                                          |
| `incorporado` em UI comum                                         | `embutido` como padrão automático                              |
