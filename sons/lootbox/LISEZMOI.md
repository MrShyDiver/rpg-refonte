# Sons de la lootbox

Chaque son est généré par le navigateur. Pour en remplacer un :

1. Dépose `<nom>.mp3` dans ce dossier.
2. Ajoute `"<nom>"` dans `liste.json`, par exemple `["explosion", "rarete-legendaire"]`.

Un nom absent de la liste, ou un fichier illisible, garde le son généré.

## La musique de l'ouverture

La musique accompagne la montée des faisceaux, palier par palier, puis s'arrête sur une conclusion.
Pendant que les cartes tombent, il n'y a plus de musique : seulement des bruitages.

| Fichier | Rôle | À prévoir |
|---|---|---|
| `musique-commun.mp3`, `musique-normal.mp3`, `musique-rare.mp3`, `musique-epique.mp3`, `musique-legendaire.mp3` | L'extrait joué pendant le palier de cette rareté | **3 secondes** chacun. Ils s'enchaînent dans cet ordre : même tempo, même tonalité (ou un ton plus haut à chaque fois), de plus en plus intense. À 160 à la noire, 3 secondes font exactement 2 mesures à 4 temps |
| `conclusion-commun.mp3` … `conclusion-legendaire.mp3` | La fin, jouée une fois quand la montée s'arrête sur cette rareté | 1 à 5 secondes. Elle doit pouvoir suivre l'extrait de la même rareté |
| `carte-commun.mp3` … `carte-legendaire.mp3` | Le bruitage d'une carte de cette rareté qui se retourne | Court (moins d'une seconde pour les Communes, qui tombent en rafale) |

Comment ça s'enchaîne :

- Un tirage dont le meilleur objet est Rare joue `musique-commun`, puis `musique-normal`, puis `musique-rare`, puis `conclusion-rare`. Une lootbox légendaire n'a pas de Commun : elle commence à `musique-normal`.
- Chaque palier dure **le temps de son extrait** (entre 1,2 et 6 secondes). Sans fichier, il dure 3 secondes avec la musique générée.
- Le passage d'un extrait au suivant est une coupure nette, calée à quelques centièmes près : termine chaque extrait sur un temps, sans queue de réverbération à couper.
- Tu peux n'en fournir que certains : un palier, une conclusion ou une carte sans fichier garde le son généré.
- Rareté : `commun`, `normal`, `rare`, `epique`, `legendaire` (sans accent).

## Les bruitages

| Nom | Quand | Remarque |
|---|---|---|
| `tension` | Le coffre tremble après le clic (1 s) ; puis la meilleure carte qui descend au ralenti | Joué en boucle, coupé net quand le couvercle saute |
| `relache` | Les faisceaux qui retombent après leur dernière hésitation | |
| `explosion` | Le couvercle saute, puis à chaque grade franchi | `explosion-<rareté>` est prioritaire s'il existe |
| `faisceau` | Le premier faisceau part du coffre | |
| `tic` | Les faisceaux crépitent avant le palier suivant (3 fois par palier) | Accéléré d'un cran à chaque palier. Sert aussi à la boutique |
| `battement` | Faux calme avant un Épique ou un Légendaire ; charge d'une carte Épique ou mieux | |
| `rarete-commun` … `rarete-legendaire` | Chaque palier atteint, puis chaque carte Rare ou mieux qui se retourne | Aussi utilisé pour les succès, la boutique et l'essai du son dans Paramètres |
| `impact` | Une carte s'abat sur la table | `impact-<rareté>` est prioritaire s'il existe |
| `envol` | Une carte tombe vers la table | Un par carte |
| `retournement` | Une carte se retourne | |
| `combo` | Une carte se retourne | Monte d'une note à chaque carte : prends une note courte |
| `nouveau` | Badge « Nouveau ! » | |
| `amelioration` | Badge « +N » | Plus aigu à mesure que N monte |
| `max` | Badge « MAX ! » | |
| `piece` | Pluie de pièces d'une carte Légendaire | 9 fois, vitesse légèrement variée |

Rareté : `commun`, `normal`, `rare`, `epique`, `legendaire`.
