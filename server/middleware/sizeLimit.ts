import type { Request, Response, NextFunction } from 'express';

/**
 * SEC-FIX: Request size limit middleware
 * 
 * Checks request size BEFORE authentication to prevent DoS attacks
 * where attackers send large payloads with invalid signatures.
 */
export function requestSizeLimit(maxSize: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check Content-Length header first (fast rejection)
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      return res.status(413).json({ 
        error: "Request too large" 
      });
    }
    
    // Also track actual body size as it streams in
    let bodySize = 0;
    const originalOn = req.on.bind(req);
    
    req.on = function(event: string, listener: any) {
      if (event === 'data') {
        return originalOn('data', (chunk: Buffer) => {
          bodySize += chunk.length;
          if (bodySize > maxSize) {
            req.destroy();
            if (!res.headersSent) {
              res.status(413).json({ error: "Request too large" });
            }
            return;
          }
          listener(chunk);
        });
      }
      return originalOn(event, listener);
    };
    
    next();
  };
}
