import argparse,pathlib,json,numpy as np,nibabel as nib
p=argparse.ArgumentParser();p.add_argument('reference');p.add_argument('candidate');a=p.parse_args();ref=pathlib.Path(a.reference);cand=pathlib.Path(a.candidate)
report={}
for name,r,c in [('warped_brain','warped-brain.nii.gz','wbt1sub-01_T1w.nii.gz'),('warped_original','warped-original.nii.gz','wsub-01_T1w.nii.gz')]:
 ri=nib.load(ref/r);ci=nib.load(cand/c);assert ri.shape==ci.shape;assert np.max(abs(ri.affine-ci.affine))<1e-4
 x=ri.get_fdata(dtype=np.float32);y=ci.get_fdata(dtype=np.float32);mask=(x>0)|(y>0);d=abs(x-y)
 report[name]={'max_absolute_difference':float(d.max()),'mean_absolute_difference':float(d.mean(dtype=np.float64)),'dice_nonzero':float(2*np.count_nonzero((x>0)&(y>0))/(np.count_nonzero(x>0)+np.count_nonzero(y>0))),'correlation':float(np.corrcoef(x[mask],y[mask])[0,1])}
 assert report[name]['dice_nonzero']>0.98
 assert report[name]['correlation']>0.99
print(json.dumps(report,indent=2));(cand/'comparison.json').write_text(json.dumps(report,indent=2))
