import bpy
import os
import math

def setup_dive_deep_kiosk_scene():
    # 1. Configure Render Engine & Color Management for Light Studio Look
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 256
    scene.render.resolution_x = 2048
    scene.render.resolution_y = 2048
    scene.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'

    # Set World Background to soft warm studio white
    if not scene.world:
        scene.world = bpy.data.worlds.new("Studio_World")
    scene.world.use_nodes = True
    bg_node = scene.world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs[0].default_value = (0.94, 0.93, 0.94, 1.0)
        bg_node.inputs[1].default_value = 0.85

    # 2. Enhance Brushed Stainless Steel Material with Procedural Anisotropic Brushing
    mat_steel = bpy.data.materials.get("Brushed_Stainless_Steel")
    if mat_steel:
        mat_steel.use_nodes = True
        nodes = mat_steel.node_tree.nodes
        links = mat_steel.node_tree.links
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.83, 0.84, 0.85, 1.0)
            bsdf.inputs["Metallic"].default_value = 0.94
            bsdf.inputs["Roughness"].default_value = 0.24
            if "Anisotropic" in bsdf.inputs:
                bsdf.inputs["Anisotropic"].default_value = 0.72
            if "Anisotropic Rotation" in bsdf.inputs:
                bsdf.inputs["Anisotropic Rotation"].default_value = 0.25

            # Add subtle linear brushed noise bump
            tex_coord = nodes.new("ShaderNodeTexCoord")
            mapping = nodes.new("ShaderNodeMapping")
            mapping.inputs["Scale"].default_value = (8.0, 220.0, 8.0)
            noise = nodes.new("ShaderNodeTexNoise")
            noise.inputs["Scale"].default_value = 18.0
            noise.inputs["Detail"].default_value = 12.0
            bump = nodes.new("ShaderNodeBump")
            bump.inputs["Strength"].default_value = 0.035
            bump.inputs["Distance"].default_value = 0.001

            links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
            links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
            links.new(noise.outputs["Fac"], bump.inputs["Height"])
            links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    # 3. Enable Smooth Shading + Weighted Normals on All Kiosk Meshes
    for obj in bpy.data.objects:
        if obj.type == 'MESH' and any(k in obj.name for k in ["01_", "02_", "03_", "04_", "05_", "06", "07", "08_", "09_"]):
            for poly in obj.data.polygons:
                poly.use_smooth = True

    # 4. Create 3-Point Softbox Studio Lighting + Camera Matching Reference Render
    def add_area_light(name, loc, rot_deg, energy, size_x, size_y, color=(1.0, 0.99, 1.0)):
        light_data = bpy.data.lights.new(name=name, type='AREA')
        light_data.energy = energy
        light_data.shape = 'RECTANGLE'
        light_data.size = size_x
        light_data.size_y = size_y
        light_data.color = color
        light_obj = bpy.data.objects.new(name=name, object_data=light_data)
        bpy.context.collection.objects.link(light_obj)
        light_obj.location = loc
        light_obj.rotation_euler = tuple(math.radians(a) for a in rot_deg)
        return light_obj

    add_area_light("Studio_Key_TopLeft", (-1.35, -1.45, 2.25), (42, 0, -38), 180.0, 1.8, 1.4)
    add_area_light("Studio_Fill_Right", (1.60, -1.20, 1.75), (52, 0, 42), 110.0, 1.6, 1.6)
    add_area_light("Studio_Overhead_Softbox", (0.0, -0.35, 2.55), (12, 0, 0), 140.0, 2.2, 1.5)

    # Camera matching the high-angle 3/4 view in the reference image
    cam_data = bpy.data.cameras.new("Kiosk_Studio_Camera")
    cam_data.lens = 58.0
    cam_obj = bpy.data.objects.new("Kiosk_Studio_Camera", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = (0.38, -1.95, 1.68)
    cam_obj.rotation_euler = (math.radians(62.5), 0.0, math.radians(10.8))
    scene.camera = cam_obj
    print("Dive Deep Kiosk studio lighting, camera, and brushed steel shaders configured!")

if __name__ == "__main__":
    setup_dive_deep_kiosk_scene()
