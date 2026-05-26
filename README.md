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


## 📁 Estrutura de Arquivos e Pastas

Para que o jogo funcione corretamente e o código se mantenha organizado, a estrutura do projeto deve seguir a ordem abaixo:

```text
meu-jogo/
├── index.html              # Ponto de entrada do jogo. Abre o Canvas no navegador.
├── css/
│   └── style.css           # Estilos básicos (ex: reset de margens, centralizar o canvas).
├── src/                    # Pasta principal contendo toda a lógica do jogo (Scripts)
│   ├── main.js             # Loop principal do jogo e captura de inputs.
│   ├── Renderer.js         # Lida com gráficos, partículas, iluminação e desenho (seu código de renderização).
│   ├── data.js             # Configurações do mapa, variáveis globais (TILE, MAP_CONFIG).
│   └── ...outros.js        # Outras classes (Player, Audio, etc).
└── assets/                 # (Opcional) Arquivos estáticos
    ├── img/                # Imagens (ex: image_c26797.png, image_c267b7.png)
    └── audio/              # Efeitos sonoros e músicas
