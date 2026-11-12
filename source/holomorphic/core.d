module holomorphic.core;

struct ComplexNum {
    double re;
    double im;

    ComplexNum opBinary(string op)(ComplexNum rhs) const pure nothrow @nogc {
        static if (op == "+") return ComplexNum(re + rhs.re, im + rhs.im);
        else static if (op == "-") return ComplexNum(re - rhs.re, im - rhs.im);
        else static if (op == "*") return ComplexNum(re * rhs.re - im * rhs.im, re * rhs.im + im * rhs.re);
        else static if (op == "/") {
            double denom = rhs.re * rhs.re + rhs.im * rhs.im;
            if (denom < 1e-12) return ComplexNum(1e9, 1e9);
            return ComplexNum((re * rhs.re + im * rhs.im) / denom, (im * rhs.re - re * rhs.im) / denom);
        }
    }

    double absSq() const pure nothrow @nogc {
        return re * re + im * im;
    }
}

double fastSqrt(double x) pure nothrow @nogc {
    if (x <= 0.0) return 0.0;
    double res = x > 1.0 ? x * 0.5 : 1.0;
    for (int i = 0; i < 8; i++) res = 0.5 * (res + x / res);
    return res;
}

double fastLog2(double val) pure nothrow @nogc {
    if (val <= 1.0) return 0.0;
    double res = 0.0;
    while (val >= 2.0) { val *= 0.5; res += 1.0; }
    double f = val - 1.0;
    return res + f * (1.442695 - 0.442695 * f);
}

struct TransformResult {
    double x;
    double y;
    double scale;
    bool isPole;
}

TransformResult moebiusStep(double zx, double zy, double cx, double cy, double panX) pure nothrow @nogc {
    auto z = ComplexNum(zx - panX, zy);
    auto a = ComplexNum(1.0, 0.0);
    auto b = ComplexNum(0.0, 0.0);
    auto c = ComplexNum(cx, cy);
    auto d = ComplexNum(1.0, 0.0);

    auto num = (a * z) + b;
    auto den = (c * z) + d;
    double denSq = den.absSq();

    if (denSq < 1e-5) {
        return TransformResult(0.0, 0.0, 0.0, true);
    }

    auto res = num / den;
    auto det = (a * d) - (b * c);
    double scale = fastSqrt(det.absSq()) / denSq;

    return TransformResult(res.re, res.im, scale, false);
}

double computeHBI(double momentum, double volatility) pure nothrow @nogc {
    double cre = momentum * 1.8 - 0.35;
    double cim = volatility * 1.6;
    double zx = 0.0, zy = 0.0;
    enum maxIter = 32;

    for (int iter = 0; iter < maxIter; iter++) {
        double x2 = zx * zx;
        double y2 = zy * zy;
        double magSq = x2 + y2;
        if (magSq > 16.0) {
            double log2Zn = fastLog2(magSq) * 0.5;
            double nu = fastLog2(log2Zn);
            double smooth = (cast(double)iter + 1.0 - nu) / cast(double)maxIter;
            return smooth < 0.0 ? 0.0 : (smooth > 1.0 ? 1.0 : smooth);
        }
        zy = 2.0 * zx * zy + cim;
        zx = x2 - y2 + cre;
    }
    return 0.0;
}

// Встроенные модульные тесты D (запускаются через dub test)
unittest {
    // Проверка тождественного отображения f(z) = z при c = 0, panX = 0
    auto r = moebiusStep(2.0, -3.0, 0.0, 0.0, 0.0);
    assert(!r.isPole);
    assert(r.x == 2.0 && r.y == -3.0);
    assert(r.scale > 0.999 && r.scale < 1.001);

    // Проверка детектора полюса: при c = -0.5, z = 2.0 => c*z + 1 = 0
    auto p = moebiusStep(2.0, 0.0, -0.5, 0.0, 0.0);
    assert(p.isPole);
}
