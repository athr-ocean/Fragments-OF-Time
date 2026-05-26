# Fragments of Time

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23F7DF1E.svg?style=flat-square&logo=javascript&logoColor=black)

Jogo web educativo desenvolvido como projeto prático e avaliação principal da disciplina de **Introdução à Ciência da Computação** no curso de Bacharelado em Ciência da Computação da **UNIVASF** (Universidade Federal do Vale do São Francisco).

## 📖 Enredo e Objetivo

A história acompanha o jovem Lucas e seu avô que, ao explorarem a garagem, encontram uma antiga máquina do tempo danificada. Por acidente, Lucas é puxado para dentro de um vórtex temporal e enviado para o passado.

Para conseguir voltar para casa, o jogador deve guiar Lucas por diferentes períodos da história da tecnologia, passando por todas as **gerações de computadores** (desde o ENIAC até os anos 2000). O avanço entre as eras ocorre através da resolução de quizzes sobre a evolução da computação.

## 🛠️ Detalhes Técnicos

O projeto foi construído de forma nativa (Vanilla), sem o uso de frameworks ou bibliotecas externas:
* **HTML5** - Estruturação das telas e quizes.
* **CSS3** - Estilização e interface responsiva.
* **JavaScript** - Lógica do jogo, controle de estados, validação das respostas e transição de eras.


## 📁 Estrutura de Arquivos

O projeto está organizado separando a camada de visualização (raiz) da lógica do jogo (módulos), estruturado da seguinte forma:

```text
Fragments-OF-Time/
├── index.html      # Ponto de entrada do jogo (Estrutura da interface e Canvas)
├── style.css       # Estilos visuais, centralização e animações da UI
├── main.js         # Script principal de navegação de telas e inicialização do jogo
└── js/             # Pasta contendo toda a lógica modular e classes do jogo
    ├── data.js     # Configurações gerais, mapas, textos e banco de perguntas
    ├── Game.js     # Máquina de estados e loop principal do jogo
    ├── GameUI.js   # Controle dinâmico da interface HTML sobreposta ao Canvas
    ├── Player.js   # Lógica de movimentação, colisão e sensores do jogador
    └── Renderer.js # Motor gráfico (desenho do mapa, iluminação e partículas)
