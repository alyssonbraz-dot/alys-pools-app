import {expect,it} from 'vitest';
import {contentPolicy} from '../src/lib/security';
import {translate} from '../src/lib/i18n/core';
it('permits local HEIF decoder workers without enabling script evaluation or remote workers',()=>{
 const policy=contentPolicy('fixed-test-nonce');
 expect(policy).toContain("worker-src 'self' blob:");expect(policy).toContain("'nonce-fixed-test-nonce'");expect(policy).not.toContain('unsafe-eval');expect(policy).not.toContain('wasm-unsafe-eval');expect(policy).not.toContain('worker-src *');
});
it('localizes pending counts, photo replacement and conversion failures in PT and ES',()=>{
 for(const language of ['pt','es'] as const){expect(translate('1 pending visit',language)).not.toBe('1 pending visit');expect(translate('3 pending visits',language)).not.toBe('3 pending visits');expect(translate('Replace photo 2',language)).not.toBe('Replace photo 2');expect(translate('Preparing photo 1 of 3',language)).not.toBe('Preparing photo 1 of 3');expect(translate('JPEG conversion failed. Your original photo is preserved. Choose another image.',language)).not.toContain('JPEG conversion failed');}
});
