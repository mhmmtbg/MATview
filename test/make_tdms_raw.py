# Elle TDMS yazar: interleaved + big-endian, 2 kanal (i16, f32), kontrol için json yazar
import struct, json, sys
def s(x,E='<'): b=x.encode(); return struct.pack(E+'I',len(b))+b
def seg(big, inter, n, chunks, base):
    E='>' if big else '<'
    toc=2|4|8|(32 if inter else 0)|(64 if big else 0)
    objs=[('/', None), ("/'G'", None), ("/'G'/'a'", (2,n)), ("/'G'/'b'", (9,n))]
    m=struct.pack(E+'I',len(objs))
    for p,ix in objs:
        m+=s(p,E)
        if ix is None: m+=struct.pack(E+'I',0xFFFFFFFF)
        else: m+=struct.pack(E+'IIIQ',20,ix[0],1,ix[1])
        m+=struct.pack(E+'I',0)
    A=[(base+i)%100-50 for i in range(n*chunks)]; B=[i*0.25 for i in range(n*chunks)]
    d=b''
    for c in range(chunks):
        a=A[c*n:(c+1)*n]; b=B[c*n:(c+1)*n]
        if inter:
            for x,y in zip(a,b): d+=struct.pack(E+'h',x)+struct.pack(E+'f',y)
        else:
            d+=b''.join(struct.pack(E+'h',x) for x in a)+b''.join(struct.pack(E+'f',y) for y in b)
    lead=b'TDSm'+struct.pack('<IIQQ',toc,4713,len(m)+len(d),len(m))
    return lead+m+d, A, B
out=sys.argv[1]; big=sys.argv[2]=='big'; inter=sys.argv[3]=='inter'
blob,A,B=seg(big,inter,10,3,0); open(out,'wb').write(blob)
json.dump({'G/a':A,'G/b':B},open(out+'.json','w'))
