-- Restaurar permisos COMPLETOS para el Super Administrador
UPDATE user_permissions
SET permissions = '{
  "id": "PERM-USER-USR-01",
  "userId": "USR-01",
  "statusId": "EST-01",
  
  "page_PAG-01_view": true, "page_PAG-01_create": true, "page_PAG-01_edit": true, "page_PAG-01_delete": true, "page_PAG-01_active": true,
  "page_PAG-02_view": true, "page_PAG-02_create": true, "page_PAG-02_edit": true, "page_PAG-02_delete": true, "page_PAG-02_active": true,
  "page_PAG-03_view": true, "page_PAG-03_create": true, "page_PAG-03_edit": true, "page_PAG-03_delete": true, "page_PAG-03_active": true,
  "page_PAG-04_view": true, "page_PAG-04_create": true, "page_PAG-04_edit": true, "page_PAG-04_delete": true, "page_PAG-04_active": true,
  "page_PAG-05_view": true, "page_PAG-05_create": true, "page_PAG-05_edit": true, "page_PAG-05_delete": true, "page_PAG-05_active": true,
  "page_PAG-06_view": true, "page_PAG-06_create": true, "page_PAG-06_edit": true, "page_PAG-06_delete": true, "page_PAG-06_active": true,
  "page_PAG-07_view": true, "page_PAG-07_create": true, "page_PAG-07_edit": true, "page_PAG-07_delete": true, "page_PAG-07_active": true,
  "page_PAG-08_view": true, "page_PAG-08_create": true, "page_PAG-08_edit": true, "page_PAG-08_delete": true, "page_PAG-08_active": true,
  "page_PAG-09_view": true, "page_PAG-09_create": true, "page_PAG-09_edit": true, "page_PAG-09_delete": true, "page_PAG-09_active": true,
  "page_PAG-10_view": true, "page_PAG-10_create": true, "page_PAG-10_edit": true, "page_PAG-10_delete": true, "page_PAG-10_active": true,
  "page_PAG-11_view": true, "page_PAG-11_create": true, "page_PAG-11_edit": true, "page_PAG-11_delete": true, "page_PAG-11_active": true,
  "page_PAG-12_view": true, "page_PAG-12_create": true, "page_PAG-12_edit": true, "page_PAG-12_delete": true, "page_PAG-12_active": true,
  "page_PAG-13_view": true, "page_PAG-13_create": true, "page_PAG-13_edit": true, "page_PAG-13_delete": true, "page_PAG-13_active": true,
  "page_PAG-14_view": true, "page_PAG-14_create": true, "page_PAG-14_edit": true, "page_PAG-14_delete": true, "page_PAG-14_active": true,
  "page_PAG-15_view": true, "page_PAG-15_create": true, "page_PAG-15_edit": true, "page_PAG-15_delete": true, "page_PAG-15_active": true,
  "page_PAG-16_view": true, "page_PAG-16_create": true, "page_PAG-16_edit": true, "page_PAG-16_delete": true, "page_PAG-16_active": true,
  "page_PAG-17_view": true, "page_PAG-17_create": true, "page_PAG-17_edit": true, "page_PAG-17_delete": true, "page_PAG-17_active": true,
  "page_PAG-18_view": true, "page_PAG-18_create": true, "page_PAG-18_edit": true, "page_PAG-18_delete": true, "page_PAG-18_active": true,
  "page_PAG-19_view": true, "page_PAG-19_create": true, "page_PAG-19_edit": true, "page_PAG-19_delete": true, "page_PAG-19_active": true,
  "page_PAG-20_view": true, "page_PAG-20_create": true, "page_PAG-20_edit": true, "page_PAG-20_delete": true, "page_PAG-20_active": true,
  "page_PAG-21_view": true, "page_PAG-21_create": true, "page_PAG-21_edit": true, "page_PAG-21_delete": true, "page_PAG-21_active": true,
  "page_PAG-22_view": true, "page_PAG-22_create": true, "page_PAG-22_edit": true, "page_PAG-22_delete": true, "page_PAG-22_active": true
}'
WHERE user_id = 'USR-01';
