# Sons de la lootbox

Chaque son est généré par le navigateur. Pour en remplacer un :

1. Dépose `<nom>.mp3` dans ce dossier.
2. Ajoute `"<nom>"` dans `liste.json`, par exemple `["explosion", "rarete-legendaire"]`.

Un nom absent de la liste, ou un fichier illisible, garde le son généré.

| Nom | Quand | Remarque |
|---|---|---|
| `tension` | Le coffre tremble | Joué en boucle, coupé net à l'explosion |
| `tic` | Chaque palier de rareté franchi | Accéléré d'un cran à chaque palier |
| `battement` | Faux calme avant un Épique ou un Légendaire, charge d'une carte Épique+ | |
| `explosion` | Le couvercle saute | `explosion-<rareté>` est prioritaire s'il existe |
| `rarete-commun` … `rarete-legendaire` | Juste après l'explosion (meilleure rareté), puis à chaque carte Rare+ d'une ouverture groupée | Aussi utilisé pour les succès, la boutique et l'essai du son dans Paramètres |
| `envol` | Les cartes jaillissent du coffre | Un par carte, à 70 ms d'écart |
| `retournement` | Une carte se retourne | |
| `combo` | Une carte se retourne | Monte d'une note à chaque carte : prends une note courte |
| `nouveau` | Badge « Nouveau ! » | |
| `amelioration` | Badge « +N » | Plus aigu à mesure que N monte |
| `max` | Badge « MAX ! » | |
| `piece` | Pluie de pièces d'une carte Légendaire | 9 fois, vitesse légèrement variée |

Rareté : `commun`, `normal`, `rare`, `epique`, `legendaire`.
