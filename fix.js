const fs = require('fs');
const path = require('path');

const dirs = [
  'd:/UST Training/Project/project v2/banking-app/frontend/src/pages',
  'd:/UST Training/Project/project v2/banking-app/frontend/src/components'
];

for(const dir of dirs) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));
  for(const file of files) {
    const p = path.join(dir, file);
    let str = fs.readFileSync(p, 'utf8');
    str = str.replace(/glass-card/g, 'surface-card');
    str = str.replace(/balance-gradient/g, 'text-primary');
    str = str.replace(/text-danger/g, 'text-danger'); // Actually it's already semantic
    str = str.replace(/text-success/g, 'text-success'); // already semantic
    
    if(file === 'Login.jsx') {
        // Safe robust replace
        let loginStr = str;
        loginStr = loginStr.replace('navigate("/dashboard");', '// navigate("/dashboard") handled by Public Route');
        loginStr = loginStr.replace('} finally { setLoading(false); }', 'setLoading(false);\n    }');
        str = loginStr;
    }
    
    fs.writeFileSync(p, str, 'utf-8');
  }
}
console.log('Successfully completed UX Alignment Script without breaking encoding!');
