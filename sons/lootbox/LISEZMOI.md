# Sons de la lootbox

Chaque son est généré par le navigateur. Pour en remplacer un :

1. Dépose `<nom>.mp3` dans ce dossier.
2. Ajoute `"<nom>"` dans `liste.json`, par exemple `["explosion", "rarete-legendaire"]`.

Un nom absent de la liste, ou un fichier illisible, garde le son généré.

| Nom | Quand | Remarque |
|---|---|---|
| `musique-commun` … `musique-legendaire` | Musique de l'ouverture : la boucle du palier de rareté atteint | Joués en boucle, l'un remplace l'autre à chaque palier. Sans fichier, la musique générée gagne une couche par palier |
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
