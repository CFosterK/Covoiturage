# Changements

## Version 2 — 27 octobre 2026

- Confirmation d’enregistrement élargie à son contenu, dans la limite de l’écran. La coche reste liée au dernier mot.
- Les détails sous le nom du passager utilisent la largeur disponible du bloc. Les groupes « dû » et « versé » restent indivisibles, avec le symbole € à côté du montant.
- Version et cache hors ligne actualisés. Calculs, données et compatibilité des sauvegardes conservés.

Vérifications automatisées dans Chrome : reproduction des montants des photos, confirmations et détails passagers en clair/sombre à 320, 390, 430 et 768 px ; contrôles des quatre onglets à 320, 390 et 768 px ; enregistrement, versement, solde, modification sans changement et hors ligne. Contrôle des captures clair/sombre sur ordinateur. Aucun essai sur un véritable iPhone.


## Version 1 — 17 octobre 2026

La version précédemment nommée V14 devient le point de départ de la nouvelle numérotation.

- Affichage « Version 1 » dans Réglage et cache hors ligne renouvelé.
- Suppression de fonctions inutilisées et de 33 sélecteurs CSS liés à d’anciens formulaires ou sélecteurs.
- Retrait des numéros de prototypes dans les explications visibles de modification d’un trajet.
- Ajout d’un README pour démarrer, d’un guide de maintenance, de `.nojekyll` et d’une exclusion des fichiers de sauvegarde locaux dans `.gitignore`.
- Conservation des calculs, des historiques, de la clé de stockage et de l’identité de l’application installée.
- Numéro technique des sauvegardes conservé pour accepter les anciennes sauvegardes multi-itinéraires V1 à V14.

Contrôles automatisés : 21 scénarios fonctionnels, calculs et restauration, 24 configurations d’affichage dans Chrome (quatre onglets, deux thèmes et trois largeurs), comparaison des styles et dimensions avant/après nettoyage, et mise à jour depuis la V14 avec conservation des opérations et rechargement hors ligne. Les sauvegardes avec une référence technique future restent refusées.

Ces contrôles sont réalisés sur ordinateur. Aucun nouvel essai sur un véritable iPhone n’a été effectué pour cette livraison.

L’historique GitHub et la branche `archive/avant-version-1` conservent le code précédent.
