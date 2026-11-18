import {inspectionTerms} from './compile-inspection-terms.mjs';
/** Presentation-only factory, independent of combat scheduling and persistence. */
export function revisionInspection(builds,profile){
 const terms=inspectionTerms(),p=profile.inspection;
 terms.itemsId=builds.items.id;
 // Retain existing formatter families; update every authored stat label and proc.
 for(const[id,s]of Object.entries(p.stats))if(Object.hasOwn(terms.stats,id))terms.stats[id]=[s.name,s.percent];
 terms.procs=Object.fromEntries(Object.entries(p.refs).filter(([id])=>id.startsWith('proc_')).map(([id,ref])=>[id.slice(5),ref]));
 return{...p,sourceCommit:profile.lock.commit,buildContentId:builds.contentId,terms};
}
