export function createNewtonRenderer(canvas, width, height, scale) {
  const gl = canvas.getContext('webgl');
  const vsSrc = 'attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }';
  const fsSrc = [
    'precision highp float;',
    'uniform vec2 u_res; uniform vec2 u_c; uniform float u_scale;',
    'vec2 cMul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }',
    'vec2 cDiv(vec2 a, vec2 b) { float d = dot(b, b); return vec2(dot(a, b), a.y*b.x - a.x*b.y) / max(d, 1e-10); }',
    'void main() {',
    '  vec2 z = (gl_FragCoord.xy - u_res * 0.5) / u_scale;',
    '  vec2 r0 = vec2(1.0, 0.0), r1 = vec2(-0.5, 0.8660254), r2 = vec2(-0.5, -0.8660254);',
    '  int found = -1; float iterCount = 0.0;',
    '  for (int i = 0; i < 100; i++) {',
    '    vec2 z2 = cMul(z, z); vec2 z3 = cMul(z2, z); vec2 den = 3.0 * z2;',
    '    if (dot(den, den) < 1e-10) break;',
    '    z = z - cDiv(z3 - vec2(1.0, 0.0), den) + u_c * 0.12;',
    '    iterCount += 1.0;',
    '    if (dot(z - r0, z - r0) < 0.01) { found = 0; break; }',
    '    if (dot(z - r1, z - r1) < 0.01) { found = 1; break; }',
    '    if (dot(z - r2, z - r2) < 0.01) { found = 2; break; }',
    '  }',
    '  float shade = pow(1.0 - (iterCount / 100.0), 1.4);',
    '  vec3 col = vec3(0.058, 0.09, 0.164);',
    '  if (found == 0) col = vec3(0.06, 0.72, 0.50) * shade;',
    '  else if (found == 1) col = vec3(0.23, 0.51, 0.96) * shade;',
    '  else if (found == 2) col = vec3(0.95, 0.24, 0.36) * shade;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  gl.uniform2f(gl.getUniformLocation(prog, 'u_res'), width, height);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_scale'), scale * 1.1);
  const uC = gl.getUniformLocation(prog, 'u_c');

  return function draw(cx, cy) {
    gl.uniform2f(uC, cx, cy);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}
