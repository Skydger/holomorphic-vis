module holomorphic.capi;

import holomorphic.core;
import holomorphic.vision;

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

int hv_detect_objects(
    const(uint)* rgba_buffer,
    int width, int height,
    int threshold, int min_area,
    DetectedObject* out_objects, int max_objects,
    int* visited_mask
) pure nothrow @nogc {
    return segmentObjects(rgba_buffer, width, height, threshold, min_area, out_objects, max_objects, visited_mask);
}

void hv_cross_ratio(
    double x1, double y1, double x2, double y2,
    double x3, double y3, double x4, double y4,
    double* out_re, double* out_im
) pure nothrow @nogc {
    auto cr = computeCrossRatio(
        ComplexNum(x1, y1), ComplexNum(x2, y2),
        ComplexNum(x3, y3), ComplexNum(x4, y4)
    );
    *out_re = cr.re;
    *out_im = cr.im;
}

int hv_compute_3d_depth(
    const(DetectedObject)* objs1, int count1,
    const(DetectedObject)* objs2, int count2,
    double* out_z
) pure nothrow @nogc {
    return computeStereoDepth(objs1, count1, objs2, count2, out_z);
}
