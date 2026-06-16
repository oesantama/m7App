with open('/home/oscars_it/Documentos/oscar/m7App/components/Logistics/InformesGerenciales.tsx', 'r') as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "const ocBarData = getOcBarDataByMonth();" in line:
        # found the start of the IIFE
        # The block starts at {(() => { one line before this
        start_idx = i - 1
        break

if start_idx != -1:
    # Now find the end. It's the end of the IIFE: `})()`
    # We will look for it right before the sub-report tab switcher
    for i in range(start_idx, len(lines)):
        if "SUB-REPORT TAB SYSTEM SWITCHER" in lines[i]:
            # The IIFE ends right before the empty line or switcher
            for j in range(i-1, start_idx, -1):
                if "})()" in lines[j]:
                    end_idx = j
                    break
            break

if start_idx != -1 and end_idx != -1:
    print(f"Found block from {start_idx} to {end_idx}")
    block = lines[start_idx:end_idx+1]
    
    # Remove block
    del lines[start_idx:end_idx+1]
    
    # Now find the target: `tdmVentas` section
    # The condition ends with: `) : (` followed by `<div className="space-y-8 animate-in fade-in duration-300">`
    # and then `{(() => { const rawGeneralData = getGeneralTdmTableData();`
    target_idx = -1
    for i, line in enumerate(lines):
        if "const rawGeneralData = getGeneralTdmTableData();" in line:
            # We want to insert the charts right before this IIFE starts?
            # Or outside the IIFE, right after the `<div className="space-y-8 animate-in fade-in duration-300">`
            # Let's insert it inside the div.
            for j in range(i-1, 0, -1):
                if "animate-in fade-in" in lines[j]:
                    target_idx = j + 1
                    break
            break
            
    if target_idx != -1:
        print(f"Target found at {target_idx}")
        # Insert block
        lines[target_idx:target_idx] = block
        
        with open('/home/oscars_it/Documentos/oscar/m7App/components/Logistics/InformesGerenciales.tsx', 'w') as f:
            f.writelines(lines)
        print("Success")
    else:
        print("Target not found")
else:
    print("Block not found")
