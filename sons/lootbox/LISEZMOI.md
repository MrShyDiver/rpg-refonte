# Sons de la lootbox

Chaque son est généré par le navigateur. Pour en remplacer un :

1. Dépose `<nom>.mp3` dans ce dossier.
2. Ajoute `"<nom>"` dans `liste.json`, par exemple `["explosion", "rarete-legendaire"]`.

Un nom absent de la liste, ou un fichier illisible, garde le son généré.

| Nom | Quand | Remarque |
|---|---|---|
| `tension` | Le coffre se charge pendant qu'on le maintient ; puis la meilleure carte qui descend au ralenti | Joué en boucle, coupé net au lancement |
| `relache` | Coffre relâché avant la fin de la charge ; le faisceau qui retombe après sa dernière hésitation | |
| `explosion` | Le couvercle saute, puis à chaque grade franchi | `explosion-<rareté>` est prioritaire s'il existe |
| `faisceau` | Le faisceau part du coffre | |
| `tic` | Le faisceau hésite avant de monter d'un grade (3 fois par palier) ; coffre chargé à bloc | Accéléré d'un cran à chaque palier. Sert aussi à la boutique |
| `battement` | Faux calme avant un Épique ou un Légendaire ; charge d'une carte Épique ou mieux | |
| `rarete-commun` … `rarete-legendaire` | Chaque grade atteint par le faisceau, puis chaque carte Rare ou mieux qui se retourne | Aussi utilisé pour les succès, la boutique et l'essai du son dans Paramètres |
| `impact` | Une carte s'abat sur la table | `impact-<rareté>` est prioritaire s'il existe |
| `envol` | Une carte tombe vers la table | Un par carte |
| `retournement` | Une carte se retourne | |
| `combo` | Une carte se retourne | Monte d'une note à chaque carte : prends une note courte |
| `nouveau` | Badge « Nouveau ! » | |
| `amelioration` | Badge « +N » | Plus aigu à mesure que N monte |
| `max` | Badge « MAX ! » | |
| `piece` | Pluie de pièces d'une carte Légendaire | 9 fois, vitesse légèrement variée |

Rareté : `commun`, `normal`, `rare`, `epique`, `legendaire`.
