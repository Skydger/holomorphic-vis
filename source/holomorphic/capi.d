module holomorphic.capi;

import holomorphic.core;

export extern(C):

int hv_transform_point(
    double zx, double zy,
    double cx, double cy,
    double pan_x,
    double* out_x, double* out_y,
    double* out_scale
) pure nothrow @nogc {
    auto res = moebiusStep(zx, zy, cx, cy, pan_x);
    *out_x = res.x;
    *out_y = res.y;
    *out_scale = res.scale;
    return res.isPole ? 1 : 0;
}

void hv_transform_batch(
    const(double)* in_x, const(double)* in_y,
    double* out_x, double* out_y,
    double* out_scale, int* out_flags,
    int count, double cx, double cy, double pan_x
) pure nothrow @nogc {
    for (int i = 0; i < count; i++) {
        auto res = moebiusStep(in_x[i], in_y[i], cx, cy, pan_x);
        out_x[i] = res.x;
        out_y[i] = res.y;
        out_scale[i] = res.scale;
        out_flags[i] = res.isPole ? 1 : 0;
    }
}

double hv_calc_market_hbi(double momentum, double volatility) pure nothrow @nogc {
    return computeHBI(momentum, volatility);
}
