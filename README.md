# RoboPlay

Um playground de robôs no navegador: arraste, controle, programe e complete missões numa paisagem 2D. Interface toda em português do Brasil, funciona com mouse, teclado e toque.

**No ar:** https://roboplay.vercel.app (veja a URL final no fim deste arquivo)

## O que tem

- **Robôs** desenhados em canvas: antena piscando, olhos que seguem o cursor e piscam, pernas ou rodas, braços, sombra, nome e balões de fala.
- **Controles:** clique para selecionar, clique no gramado para andar (com linha tracejada até o destino), setas/WASD, Espaço pega e solta, R rega, Tab troca de robô. Dá para arrastar e arremessar robôs, caixas e bolas.
- **Física** com Matter.js no plano do chão e altura simulada à parte: pilhas de caixas, quiques, chutes, rampas.
- **Mundo:** céu com sol, nuvens, montanhas com neve, colinas e árvores com paralaxe; ciclo de dia e noite (estrelas, lua, antenas brilhando); chuva com poças escorregadias, neve que acumula e derrete; lago que os robôs contornam (madeira boia, metal afunda e é "cuspido" de volta); pássaros que fogem; macieiras que derrubam maçãs.
- **Personalidade:** editor (cor, cabeça, antena, pernas/rodas, nome) salvo no navegador; robô fica tonto quando chacoalhado, dorme quando parado, comemora; bateria que acaba e estação de recarga.
- **Cenário:** esteira, cerca com porta e botões de pressão, rampas, pedras, gol com placar, cesta, alvos, plantas que crescem ao regar e mini-fábrica de separação por cor.
- **Programação por blocos** (estilo Scratch, feita do zero): andar, virar, ir até, pegar, soltar, chutar, regar, dançar, repetir, se/senão com sensores, dizer, esperar. Executar, pausar e passo a passo com destaque do bloco atual.
- **Missões** com cronômetro e até 3 estrelas: Entrega expressa, Artilheiro, Tiro ao alvo, Colheita, Fábrica em ordem, Jardineiro e Programador (só blocos). Progresso salvo no navegador.
- **Sons** sintetizados (WebAudio) com botão de mudo.

## Rodar localmente

Precisa de Node 18 ou mais novo.

```bash
npm install
npm run dev        # abre em http://localhost:5180
```

Outros comandos:

```bash
npm run build      # checa os tipos (tsc) e gera a versão final em dist/
npm run preview    # serve a pasta dist/ para testar a versão final
```

## Publicar de novo (Vercel)

O site é estático (Vite), então a Vercel detecta tudo sozinha.

```bash
npm run build                 # confira que não há erros
npx vercel --prod             # publica em produção
```

Na primeira vez a CLI pede login (`npx vercel login`) e pergunta a qual projeto vincular; depois disso, `npx vercel --prod` basta. Se preferir, conecte o repositório no painel da Vercel e cada `git push` publica automaticamente.

## Estrutura

```
index.html              tela inicial e ponto de entrada
public/                 favicon
src/
  main.ts               monta o jogo, a interface e a cena inicial
  game.ts               loop fixo a 60 Hz, entidades, seleção, arrastar/arremessar, colisões, renderização
  config.ts             dimensões do mundo e perspectiva
  util.ts               matemática, cores, aleatório com semente
  style.css             estilos da interface
  world/
    landscape.ts        céu, astros, nuvens, montanhas, colinas, gramado (com cache), paralaxe
    daynight.ts         ciclo de dia e noite e cores do céu
    weather.ts          chuva, neve, poças, piso escorregadio
    lake.ts             lago: contorno, boiar/afundar, ondulações
    trees.ts            pinheiros, árvores e macieiras
    birds.ts            pássaros
    station.ts          estação de recarga
    props.ts            esteira, cerca/porta/botões, rampa, pedra, gol, placar, cesta, alvo, planta, fábrica
    pathing.ts          obstáculos e rotas (grafo de visibilidade)
    camera.ts           câmera que segue o robô ou é arrastada
  entities/
    entity.ts           base: posição no chão + altura, quedas, pilhas
    robot.ts            robô: desenho, movimento, humor, bateria, falas
    box.ts, ball.ts, apple.ts
  systems/
    physics.ts          Matter.js (plano do chão, gravidade zero)
    input.ts            mouse, toque e teclado
    audio.ts            sons sintetizados
    particles.ts        confete, gotas, brilhos, "Zzz"
    blocks.ts           modelo e interpretador dos blocos
    missions.ts         definições e regras das missões
    storage.ts          localStorage (robôs e progresso)
  ui/
    hud.ts              barra de ferramentas, status, avisos, painéis, ajuda
    touch.ts            joystick virtual e botões de toque
    worldControls.ts    horário e clima
    editor.ts           personalização do robô
    blocksPanel.ts      painel de programação por blocos
    missions.ts         lista de missões, barra da missão e resultado
```

### Dados salvos no navegador

| Chave | Conteúdo |
| --- | --- |
| `roboplay.robos` | robôs personalizados |
| `roboplay.programa` | programa de blocos |
| `roboplay.missoes` | estrelas e recordes |
| `roboplay.mudo` | som ligado/desligado |

Para começar do zero, limpe os dados do site no navegador.
