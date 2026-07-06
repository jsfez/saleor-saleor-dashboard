---
"saleor-dashboard": patch
---

Fixed the reference value picker on models (pages) not respecting the attribute's configured type restriction. When a reference attribute limits references to specific product types or model types, editing a model and assigning a value now pre-sets that filter in the picker dialog and only shows matching items, instead of listing all items. This already worked for products and now behaves the same for models.
