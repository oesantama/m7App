
async function testApi() {
    console.log('--- DIAGNOSTICO API PERMISOS ---');
    try {
        console.log('Consultando Permisos USR-01...');
        const resPerm = await fetch('http://localhost:8080/api/user-permissions/USR-01');
        if (resPerm.ok) {
            const perm = await resPerm.json();
            console.log('Objeto Raiz recibido:', JSON.stringify(perm).substring(0, 100) + '...');
            
            // Verificar si está "desempaquetado"
            const unpacked = perm['page_PAG-22_view'];
            console.log('Acceso directo page_PAG-22_view:', unpacked);
            
            if (unpacked === true) {
                console.log('EXITO: Permisos entregados en formato correcto (Flat Object).');
            } else {
                console.log('FALLO: Permisos siguen anidados o incorrectos.');
                if (perm.permissions) console.log('Detectado campo .permissions anidado (formato row raw).');
            }
        } else {
            console.log('Error Permisos:', resPerm.status);
        }

    } catch (e) {
        console.error('ERROR FETCH:', e);
    }
}

testApi();
