# Sons de la lootbox

Chaque son est généré par le navigateur. Pour en remplacer un :

1. Dépose `<nom>.mp3` dans ce dossier.
2. Ajoute `"<nom>"` dans `liste.json`, par exemple `["explosion", "rarete-legendaire"]`.

Un nom absent de la liste, ou un fichier illisible, garde le son généré.

| Nom | Quand | Remarque |
|---|---|---|
| `tension` | Le coffre tremble, après le clic | Joué en boucle (environ 1 s), coupé net à l'explosion |
| `explosion` | Le couvercle saute | Toujours le même : il ne doit pas trahir la rareté |
| `indice-commun` … `indice-legendaire` | Survol d'une carte face cachée (ou juste avant son retournement au toucher) | Discret : c'est l'indice qui laisse deviner la rareté. `indice` seul sert pour toutes les raretés sans fichier dédié |
| `rarete-commun` … `rarete-legendaire` | Quand une carte Rare ou mieux se retourne | Aussi utilisé pour les succès, la boutique et l'essai du son dans Paramètres |
| `envol` | Les cartes jaillissent du coffre | Un par carte, à 70 ms d'écart |
| `retournement` | Une carte se retourne | |
| `combo` | Une carte se retourne | Monte d'une note à chaque carte : prends une note courte |
| `nouveau` | Badge « Nouveau ! » | |
| `amelioration` | Badge « +N » | Plus aigu à mesure que N monte |
| `max` | Badge « MAX ! » | |
| `piece` | Pluie de pièces d'une carte Légendaire | 9 fois, vitesse légèrement variée |

Rareté : `commun`, `normal`, `rare`, `epique`, `legendaire`.
