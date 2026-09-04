"""Gera os dados didáticos diretamente do FlexoPy fornecido com o curso.

Uso: python scripts/generate-interaction.py --flexopy-root /caminho/pilares
O diretório informado deve conter src/flexopy. Não é necessário Python no site.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--flexopy-root", type=Path, required=True)
    args = parser.parse_args()
    source = args.flexopy_root.resolve() / "src"
    if not (source / "flexopy" / "interaction.py").is_file():
        parser.error("Informe a raiz do código original, contendo src/flexopy.")
    sys.path.insert(0, str(source))
    from flexopy.demo import build_default_model

    _, generator = build_default_model(nx=48, ny=72)
    capacity = generator.pure_compression_capacity_kn()
    # Maior resolução perto do topo, onde as curvas convergem para um ponto.
    fractions = sorted(set(np.linspace(0, 0.96, 49).tolist() + [0.975, 0.985, 0.992, 0.997, 1.0]))
    angles = 120
    vertices = []
    rings = []
    residual = 0.0
    reference_checks = []
    for i, fraction in enumerate(fractions):
        curve = generator.fixed_n_curve(float(fraction * capacity), n_angles=angles)
        if not curve.diagnostics.complete:
            raise RuntimeError("Curva incompleta: geração interrompida.")
        residual = max(residual, curve.diagnostics.max_axial_residual_n)
        ring = []
        for point in curve.points:
            ring.append(len(vertices))
            # Ordem de armazenamento: [Mx (kN.m), My (kN.m), N (kN)].
            # N é fixado no alvo; desvio numérico máximo fica nos metadados.
            vertices.append([round(point.mx_knm, 7), round(point.my_knm, 7), round(curve.nd_kn, 7)])
        rings.append(ring)
        if i in (0, 20, 40, len(fractions) - 1):
            point = curve.points[len(curve.points) // 5]
            plane, _ = generator.profile(np.radians(point.theta_deg), point.t)
            reference_checks.append({
                "plane": {"eps0PerMille": plane.eps0 * 1000, "gxPerMillePerM": plane.gx_per_mm * 1e6, "gyPerMillePerM": plane.gy_per_mm * 1e6},
                "point": [point.mx_knm, point.my_knm, point.n_kn],
            })
        print(f"Curva {i + 1}/{len(fractions)} · N={curve.nd_kn:.1f} kN", flush=True)

    triangles = []
    for lower, upper in zip(rings, rings[1:]):
        for j in range(len(lower)):
            k = (j + 1) % len(lower)
            if len(upper) == 1:
                triangles.append([lower[j], lower[k], upper[0]])
            else:
                triangles.extend([[lower[j], lower[k], upper[k]], [lower[j], upper[k], upper[j]]])
    # N=0 é limite do escopo, não ruptura por tração. A tampa fecha somente
    # o volume didático e permite fechar os cortes verticais nesse limite.
    base_center = len(vertices)
    vertices.append([0, 0, 0])
    for j in range(angles):
        triangles.append([base_center, rings[0][(j + 1) % angles], rings[0][j]])

    source_files = ["analysis.py", "demo.py", "geometry.py", "interaction.py", "limit_states.py", "materials.py", "solvers.py", "strain.py"]
    data = {
        "schemaVersion": 1,
        "model": "30 × 60 cm · C30 · CA-50 · 8 Ø16",
        "method": "FlexoPy ULSInteractionGenerator.fixed_n_curve; pontos externos por orientação; malha triangular sem fecho convexo 3D",
        "scope": "N >= 0; tampa N=0 é limite do escopo, não uma fronteira de ruptura à tração",
        "nCapacityKn": capacity,
        "nAngles": angles,
        "nLevels": len(rings),
        "maxAxialResidualN": residual,
        "sourceSha256": {name: hashlib.sha256((source / "flexopy" / name).read_bytes()).hexdigest() for name in source_files},
        "vertices": vertices,
        "triangles": triangles,
        "rings": rings,
        "referenceChecks": reference_checks,
    }
    target = Path(__file__).resolve().parents[1] / "src" / "data" / "interaction-surface.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Pronto: {len(vertices)} vértices, {len(triangles)} triângulos; resíduo máximo {residual:.3e} N", flush=True)


if __name__ == "__main__":
    main()
