#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
材料表征模拟模块
Material Characterization Simulation Module

基于MATBG的结构特征和物理性质，模拟生成：
1. SEM/TEM图像数据
2. XRD衍射图谱
3. 拉曼光谱数据
4. AFM形貌数据
5. XPS化学状态分析
6. BET比表面积分析

科学依据：
- 基于MATBG的摩尔超晶格结构特征
- 考虑扭转角度对材料性质的影响
- 遵循各种表征技术的物理原理
- 引入真实的实验条件和噪声
"""

import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
from scipy import ndimage
from scipy.signal import find_peaks
from skimage import filters, morphology
import os

class MaterialCharacterizationSimulator:
    """材料表征模拟器"""
    
    def __init__(self, matbg_system):
        """
        初始化材料表征模拟器
        
        参数:
        matbg_system: MATBG模拟系统实例
        """
        self.system = matbg_system
        
        # 表征参数
        self.characterization_params = {
            'sem_resolution': 1.0,  # nm
            'tem_resolution': 0.1,  # nm
            'xrd_wavelength': 1.5406,  # Cu Kα (Å)
            'raman_laser': 532,  # nm
            'afm_resolution': 0.5,  # nm
        }
    
    def simulate_sem_image(self, image_size=(512, 512), save_dir=None):
        """
        模拟SEM图像
        
        参数:
        image_size: 图像尺寸 (像素)
        save_dir: 保存目录
        
        返回:
        sem_data: SEM图像数据
        """
        # 创建基础图像
        image = np.zeros(image_size)
        
        # 生成摩尔超晶格图案
        moire_pattern = self._generate_moire_pattern(image_size)
        
        # 添加石墨烯层结构
        graphene_structure = self._generate_graphene_structure(image_size)
        
        # 组合图像
        image = 0.6 * moire_pattern + 0.4 * graphene_structure
        
        # 添加SEM特有的噪声和对比度
        image = self._add_sem_effects(image)
        
        # 归一化到0-255
        image = ((image - image.min()) / (image.max() - image.min()) * 255).astype(np.uint8)
        
        sem_data = {
            'image': image,
            'pixel_size_nm': 50,  # 每像素50nm
            'magnification': '50,000x',
            'accelerating_voltage': '15 kV',
            'working_distance': '10 mm'
        }
        
        # 保存数据
        if save_dir:
            self._save_sem_data(sem_data, save_dir)
        
        return sem_data
    
    def simulate_tem_image(self, image_size=(1024, 1024), save_dir=None):
        """
        模拟TEM图像
        
        参数:
        image_size: 图像尺寸 (像素)
        save_dir: 保存目录
        
        返回:
        tem_data: TEM图像数据
        """
        # 创建高分辨率摩尔图案
        moire_pattern = self._generate_high_res_moire(image_size)
        
        # 添加原子级结构细节
        atomic_structure = self._generate_atomic_structure(image_size)
        
        # 组合图像
        image = 0.7 * moire_pattern + 0.3 * atomic_structure
        
        # 添加TEM特有效应
        image = self._add_tem_effects(image)
        
        # 归一化
        image = ((image - image.min()) / (image.max() - image.min()) * 255).astype(np.uint8)
        
        tem_data = {
            'image': image,
            'pixel_size_nm': 0.1,  # 每像素0.1nm
            'magnification': '500,000x',
            'accelerating_voltage': '200 kV',
            'resolution': '0.1 nm'
        }
        
        # 保存数据
        if save_dir:
            self._save_tem_data(tem_data, save_dir)
        
        return tem_data
    
    def simulate_xrd_pattern(self, two_theta_range=(10, 80), save_dir=None):
        """
        模拟XRD衍射图谱
        
        参数:
        two_theta_range: 2θ角度范围 (度)
        save_dir: 保存目录
        
        返回:
        xrd_data: XRD数据
        """
        two_theta = np.linspace(two_theta_range[0], two_theta_range[1], 2000)
        intensity = np.zeros_like(two_theta)
        
        # 主要衍射峰
        peaks = [
            {'position': 26.5, 'intensity': 1000, 'width': 0.5, 'hkl': '(002)'},  # 石墨烯主峰
            {'position': 42.4, 'intensity': 200, 'width': 0.8, 'hkl': '(100)'},   # 面内峰
            {'position': 54.7, 'intensity': 150, 'width': 0.6, 'hkl': '(004)'},   # 二级峰
        ]
        
        # 摩尔超晶格相关的额外峰
        moire_peaks = self._calculate_moire_peaks()
        peaks.extend(moire_peaks)
        
        # 生成衍射峰
        for peak in peaks:
            peak_intensity = self._generate_xrd_peak(
                two_theta, peak['position'], peak['intensity'], peak['width']
            )
            intensity += peak_intensity
        
        # 添加背景和噪声
        background = self._generate_xrd_background(two_theta)
        intensity += background
        intensity = self.system.generate_noise(intensity, noise_level=0.05)
        
        # 确保强度为正值
        intensity = np.maximum(intensity, 0)
        
        xrd_data = {
            'two_theta': two_theta,
            'intensity': intensity,
            'wavelength': self.characterization_params['xrd_wavelength'],
            'peaks': peaks
        }
        
        # 保存数据
        if save_dir:
            self._save_xrd_data(xrd_data, save_dir)
        
        return xrd_data
    
    def simulate_raman_spectrum(self, wavenumber_range=(100, 3000), save_dir=None):
        """
        模拟拉曼光谱
        
        参数:
        wavenumber_range: 波数范围 (cm⁻¹)
        save_dir: 保存目录
        
        返回:
        raman_data: 拉曼光谱数据
        """
        wavenumber = np.linspace(wavenumber_range[0], wavenumber_range[1], 2000)
        intensity = np.zeros_like(wavenumber)
        
        # 石墨烯特征峰
        peaks = [
            {'position': 1350, 'intensity': 200, 'width': 50, 'name': 'D peak'},    # D峰（缺陷）
            {'position': 1580, 'intensity': 1000, 'width': 30, 'name': 'G peak'},   # G峰（面内振动）
            {'position': 2700, 'intensity': 800, 'width': 80, 'name': '2D peak'},   # 2D峰
            {'position': 2950, 'intensity': 100, 'width': 60, 'name': 'D+G peak'},  # D+G峰
        ]
        
        # MATBG特有的峰位移和强度变化
        peaks = self._modify_peaks_for_matbg(peaks)
        
        # 生成拉曼峰
        for peak in peaks:
            peak_intensity = self._generate_raman_peak(
                wavenumber, peak['position'], peak['intensity'], peak['width']
            )
            intensity += peak_intensity
        
        # 添加荧光背景和噪声
        background = self._generate_raman_background(wavenumber)
        intensity += background
        intensity = self.system.generate_noise(intensity, noise_level=0.03)
        
        # 确保强度为正值
        intensity = np.maximum(intensity, 0)
        
        raman_data = {
            'wavenumber': wavenumber,
            'intensity': intensity,
            'laser_wavelength': self.characterization_params['raman_laser'],
            'peaks': peaks
        }
        
        # 保存数据
        if save_dir:
            self._save_raman_data(raman_data, save_dir)
        
        return raman_data
    
    def simulate_afm_topography(self, scan_size=(1000, 1000), save_dir=None):
        """
        模拟AFM形貌数据
        
        参数:
        scan_size: 扫描尺寸 (nm)
        save_dir: 保存目录
        
        返回:
        afm_data: AFM数据
        """
        # 创建高度图
        image_size = (256, 256)  # 像素数
        height_map = np.zeros(image_size)
        
        # 生成摩尔超晶格的高度调制
        moire_height = self._generate_moire_height_modulation(image_size)
        
        # 添加原子级台阶和缺陷
        atomic_features = self._generate_atomic_features(image_size)
        
        # 组合高度图
        height_map = moire_height + atomic_features
        
        # 添加AFM扫描噪声
        height_map = self._add_afm_noise(height_map)
        
        # 转换为实际高度值（nm）
        height_map = height_map * 2.0  # 最大高度差2nm
        
        afm_data = {
            'height_map': height_map,
            'scan_size_nm': scan_size,
            'pixel_size_nm': (scan_size[0]/image_size[0], scan_size[1]/image_size[1]),
            'z_range_nm': (height_map.min(), height_map.max()),
            'scan_rate': '1 Hz',
            'setpoint': '2 nN'
        }
        
        # 保存数据
        if save_dir:
            self._save_afm_data(afm_data, save_dir)
        
        return afm_data
    
    def _generate_moire_pattern(self, image_size):
        """生成摩尔超晶格图案"""
        x = np.linspace(0, 2*np.pi, image_size[1])
        y = np.linspace(0, 2*np.pi, image_size[0])
        X, Y = np.meshgrid(x, y)
        
        # 摩尔周期
        moire_period = self.system.material_params['moire_period'] * 1e9  # 转换为nm
        period_pixels = image_size[0] * 50 / moire_period  # 假设图像覆盖50nm
        
        # 生成摩尔图案
        pattern1 = np.sin(X * period_pixels) * np.sin(Y * period_pixels)
        pattern2 = np.sin((X + np.pi/6) * period_pixels) * np.sin((Y + np.pi/6) * period_pixels)
        
        moire = pattern1 + 0.5 * pattern2
        return moire
    
    def _generate_graphene_structure(self, image_size):
        """生成石墨烯结构"""
        # 创建六角晶格结构
        structure = np.random.random(image_size) * 0.3
        
        # 添加层状结构特征
        for i in range(0, image_size[0], 20):
            structure[i:i+2, :] += 0.2
        
        return structure
    
    def _add_sem_effects(self, image):
        """添加SEM特有效应"""
        # 边缘增强
        edges = filters.sobel(image)
        image += 0.3 * edges
        
        # 充电效应
        charging = np.random.random(image.shape) * 0.1
        image += charging
        
        # 高斯模糊（电子束展宽）
        image = filters.gaussian(image, sigma=1.0)
        
        return image
    
    def _generate_high_res_moire(self, image_size):
        """生成高分辨率摩尔图案"""
        x = np.linspace(0, 4*np.pi, image_size[1])
        y = np.linspace(0, 4*np.pi, image_size[0])
        X, Y = np.meshgrid(x, y)
        
        # 更精细的摩尔图案
        theta = np.radians(self.system.twist_angle)
        pattern = (np.sin(X) * np.sin(Y) + 
                  np.sin(X*np.cos(theta) - Y*np.sin(theta)) * 
                  np.sin(X*np.sin(theta) + Y*np.cos(theta)))
        
        return pattern
    
    def _generate_atomic_structure(self, image_size):
        """生成原子级结构"""
        # 六角晶格
        structure = np.zeros(image_size)
        
        # 添加原子位置
        for i in range(0, image_size[0], 10):
            for j in range(0, image_size[1], 10):
                if i < image_size[0] and j < image_size[1]:
                    structure[i, j] = 1.0
                if i+5 < image_size[0] and j+5 < image_size[1]:
                    structure[i+5, j+5] = 0.8
        
        # 高斯模糊模拟原子大小
        structure = filters.gaussian(structure, sigma=2.0)
        
        return structure
    
    def _add_tem_effects(self, image):
        """添加TEM特有效应"""
        # 衍射对比度
        image += 0.2 * np.sin(image * 10)
        
        # 球差
        image = filters.gaussian(image, sigma=0.5)
        
        # 噪声 - 确保输入为正值
        image_positive = np.abs(image) + 0.1  # 确保为正值
        noise = np.random.poisson(image_positive * 10) / 10.0
        image = 0.8 * image + 0.2 * noise
        
        return image
    
    def _calculate_moire_peaks(self):
        """计算摩尔超晶格相关的衍射峰"""
        # 基于摩尔周期计算额外的衍射峰
        moire_period = self.system.material_params['moire_period']
        
        # 摩尔超晶格的倒格矢
        q_moire = 2 * np.pi / moire_period
        
        # 对应的2θ角度
        wavelength = self.characterization_params['xrd_wavelength'] * 1e-10
        theta_moire = np.arcsin(q_moire * wavelength / (4 * np.pi))
        two_theta_moire = 2 * np.degrees(theta_moire)
        
        moire_peaks = [
            {'position': two_theta_moire, 'intensity': 50, 'width': 0.3, 'hkl': 'moiré'},
            {'position': two_theta_moire * 2, 'intensity': 20, 'width': 0.4, 'hkl': 'moiré-2'},
        ]
        
        return moire_peaks
    
    def _generate_xrd_peak(self, two_theta, position, intensity, width):
        """生成XRD衍射峰"""
        # 伪Voigt函数（高斯和洛伦兹的组合）
        gaussian = intensity * np.exp(-0.5 * ((two_theta - position) / width)**2)
        lorentzian = intensity / (1 + ((two_theta - position) / width)**2)
        
        # 混合比例
        eta = 0.5
        peak = eta * lorentzian + (1 - eta) * gaussian
        
        return peak
    
    def _generate_xrd_background(self, two_theta):
        """生成XRD背景"""
        # 非晶背景
        background = 50 * np.exp(-two_theta / 30) + 10
        
        # 添加缓慢变化
        background += 20 * np.sin(two_theta / 20)
        
        return background
    
    def _modify_peaks_for_matbg(self, peaks):
        """修改拉曼峰以反映MATBG特征"""
        modified_peaks = []
        
        for peak in peaks:
            modified_peak = peak.copy()
            
            # MATBG对各峰的影响
            if peak['name'] == 'G peak':
                # G峰位移和强度变化
                modified_peak['position'] += 2  # 轻微红移
                modified_peak['intensity'] *= 1.2  # 强度增强
            elif peak['name'] == '2D peak':
                # 2D峰的显著变化
                modified_peak['position'] -= 5  # 红移
                modified_peak['intensity'] *= 0.8  # 强度降低
                modified_peak['width'] *= 1.3  # 峰宽增加
            elif peak['name'] == 'D peak':
                # D峰强度降低（高质量MATBG）
                modified_peak['intensity'] *= 0.5
            
            modified_peaks.append(modified_peak)
        
        return modified_peaks
    
    def _generate_raman_peak(self, wavenumber, position, intensity, width):
        """生成拉曼峰"""
        # 洛伦兹峰形
        peak = intensity / (1 + ((wavenumber - position) / width)**2)
        return peak
    
    def _generate_raman_background(self, wavenumber):
        """生成拉曼背景"""
        # 荧光背景
        background = 100 * np.exp(-wavenumber / 1000) + 20
        
        # 添加缓慢变化
        background += 30 * np.exp(-(wavenumber - 1500)**2 / 500000)
        
        return background
    
    def _generate_moire_height_modulation(self, image_size):
        """生成摩尔超晶格的高度调制"""
        x = np.linspace(0, 2*np.pi, image_size[1])
        y = np.linspace(0, 2*np.pi, image_size[0])
        X, Y = np.meshgrid(x, y)
        
        # 摩尔图案的高度调制
        height = 0.5 * (np.sin(X * 2) * np.sin(Y * 2) + 
                       np.sin(X * 3 + np.pi/4) * np.sin(Y * 3 + np.pi/4))
        
        return height
    
    def _generate_atomic_features(self, image_size):
        """生成原子级特征"""
        features = np.random.random(image_size) * 0.1
        
        # 添加台阶边缘
        for i in range(0, image_size[0], 50):
            features[i:i+2, :] += 0.3
        
        return features
    
    def _add_afm_noise(self, height_map):
        """添加AFM扫描噪声"""
        # 热噪声
        thermal_noise = np.random.normal(0, 0.05, height_map.shape)
        
        # 扫描线噪声
        scan_noise = np.zeros_like(height_map)
        for i in range(height_map.shape[0]):
            scan_noise[i, :] = np.random.normal(0, 0.02)
        
        return height_map + thermal_noise + scan_noise
    
    def _save_sem_data(self, sem_data, save_dir):
        """保存SEM数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存图像
        plt.figure(figsize=(8, 8))
        plt.imshow(sem_data['image'], cmap='gray')
        plt.title(f"SEM Image - {sem_data['magnification']}")
        plt.axis('off')
        plt.tight_layout()
        plt.savefig(os.path.join(save_dir, 'sem_image.png'), dpi=300, bbox_inches='tight')
        plt.close()
        
        # 保存参数
        params_df = pd.DataFrame([sem_data])
        params_df.to_csv(os.path.join(save_dir, 'sem_parameters.csv'), index=False)
    
    def _save_tem_data(self, tem_data, save_dir):
        """保存TEM数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存图像
        plt.figure(figsize=(10, 10))
        plt.imshow(tem_data['image'], cmap='gray')
        plt.title(f"TEM Image - {tem_data['magnification']}")
        plt.axis('off')
        plt.tight_layout()
        plt.savefig(os.path.join(save_dir, 'tem_image.png'), dpi=300, bbox_inches='tight')
        plt.close()
        
        # 保存参数
        params_df = pd.DataFrame([tem_data])
        params_df.to_csv(os.path.join(save_dir, 'tem_parameters.csv'), index=False)
    
    def _save_xrd_data(self, xrd_data, save_dir):
        """保存XRD数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存数据
        df = pd.DataFrame({
            'Two_Theta_deg': xrd_data['two_theta'],
            'Intensity_counts': xrd_data['intensity']
        })
        df.to_csv(os.path.join(save_dir, 'xrd_pattern.csv'), index=False)
        
        # 保存峰位信息
        peaks_df = pd.DataFrame(xrd_data['peaks'])
        peaks_df.to_csv(os.path.join(save_dir, 'xrd_peaks.csv'), index=False)
    
    def _save_raman_data(self, raman_data, save_dir):
        """保存拉曼数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存数据
        df = pd.DataFrame({
            'Wavenumber_cm-1': raman_data['wavenumber'],
            'Intensity_counts': raman_data['intensity']
        })
        df.to_csv(os.path.join(save_dir, 'raman_spectrum.csv'), index=False)
        
        # 保存峰位信息
        peaks_df = pd.DataFrame(raman_data['peaks'])
        peaks_df.to_csv(os.path.join(save_dir, 'raman_peaks.csv'), index=False)
    
    def _save_afm_data(self, afm_data, save_dir):
        """保存AFM数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存高度图数据
        np.savetxt(os.path.join(save_dir, 'afm_height_map.txt'), afm_data['height_map'])
        
        # 保存参数
        params = {k: v for k, v in afm_data.items() if k != 'height_map'}
        params_df = pd.DataFrame([params])
        params_df.to_csv(os.path.join(save_dir, 'afm_parameters.csv'), index=False)
    
    def simulate_xps_spectrum(self, binding_energy_range=(280, 540), save_dir=None):
        """
        模拟XPS光谱数据
        
        XPS (X-ray Photoelectron Spectroscopy) 用于分析材料的化学状态
        
        参数:
        binding_energy_range: 结合能范围 (eV)
        save_dir: 保存目录
        
        返回:
        xps_data: XPS光谱数据
        """
        binding_energy = np.linspace(binding_energy_range[0], binding_energy_range[1], 1000)
        intensity = np.zeros_like(binding_energy)
        
        # C 1s 峰 - 石墨烯碳的特征峰
        c1s_peaks = [
            {'position': 284.6, 'intensity': 1000, 'width': 1.2, 'assignment': 'C-C sp2 (graphene)'},
            {'position': 285.4, 'intensity': 150, 'width': 1.5, 'assignment': 'C-C sp3 (defects)'},
            {'position': 286.5, 'intensity': 80, 'width': 1.8, 'assignment': 'C-O'},
            {'position': 288.5, 'intensity': 50, 'width': 2.0, 'assignment': 'C=O'},
            {'position': 291.0, 'intensity': 30, 'width': 2.5, 'assignment': 'π-π* satellite'},
        ]
        
        # Na 1s 峰 - 钠离子嵌入后的特征
        na1s_peaks = [
            {'position': 1071.5, 'intensity': 200, 'width': 2.0, 'assignment': 'Na+ intercalated'},
        ]
        
        # O 1s 峰 - 表面氧化物
        o1s_peaks = [
            {'position': 532.0, 'intensity': 120, 'width': 2.0, 'assignment': 'C-O'},
            {'position': 533.5, 'intensity': 60, 'width': 2.2, 'assignment': 'C=O'},
        ]
        
        all_peaks = c1s_peaks + o1s_peaks
        
        # 生成XPS峰
        for peak in all_peaks:
            if binding_energy_range[0] <= peak['position'] <= binding_energy_range[1]:
                peak_intensity = self._generate_xps_peak(
                    binding_energy, peak['position'], peak['intensity'], peak['width']
                )
                intensity += peak_intensity
        
        # 添加Shirley背景
        background = self._generate_shirley_background(binding_energy, intensity)
        intensity += background
        
        # 添加噪声
        intensity = self.system.generate_noise(intensity, noise_level=0.02)
        intensity = np.maximum(intensity, 0)
        
        xps_data = {
            'binding_energy': binding_energy,
            'intensity': intensity,
            'c1s_peaks': c1s_peaks,
            'o1s_peaks': o1s_peaks,
            'x_ray_source': 'Al Kα (1486.6 eV)',
            'pass_energy': '20 eV',
            'step_size': '0.1 eV'
        }
        
        if save_dir:
            self._save_xps_data(xps_data, save_dir)
        
        return xps_data
    
    def _generate_xps_peak(self, binding_energy, position, intensity, width):
        """生成XPS峰 - 使用Voigt线型"""
        # 高斯-洛伦兹混合
        gaussian = np.exp(-0.5 * ((binding_energy - position) / width)**2)
        lorentzian = 1 / (1 + ((binding_energy - position) / width)**2)
        # XPS峰通常以高斯为主
        peak = intensity * (0.7 * gaussian + 0.3 * lorentzian)
        return peak
    
    def _generate_shirley_background(self, binding_energy, intensity):
        """生成Shirley背景"""
        # 简化的Shirley背景
        background = np.zeros_like(intensity)
        cumsum = np.cumsum(intensity[::-1])[::-1]
        background = 0.001 * cumsum / (len(intensity))
        background += 50  # 基线
        return background
    
    def _save_xps_data(self, xps_data, save_dir):
        """保存XPS数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存光谱数据
        df = pd.DataFrame({
            'Binding_Energy_eV': xps_data['binding_energy'],
            'Intensity_counts': xps_data['intensity']
        })
        df.to_csv(os.path.join(save_dir, 'xps_spectrum.csv'), index=False)
        
        # 保存峰位信息
        peaks_data = []
        for peak in xps_data['c1s_peaks']:
            peak_copy = peak.copy()
            peak_copy['element'] = 'C 1s'
            peaks_data.append(peak_copy)
        for peak in xps_data['o1s_peaks']:
            peak_copy = peak.copy()
            peak_copy['element'] = 'O 1s'
            peaks_data.append(peak_copy)
        
        peaks_df = pd.DataFrame(peaks_data)
        peaks_df.to_csv(os.path.join(save_dir, 'xps_peaks.csv'), index=False)
        
        # 保存参数
        params = {k: v for k, v in xps_data.items() 
                  if k not in ['binding_energy', 'intensity', 'c1s_peaks', 'o1s_peaks']}
        params_df = pd.DataFrame([params])
        params_df.to_csv(os.path.join(save_dir, 'xps_parameters.csv'), index=False)
    
    def simulate_bet_analysis(self, pressure_range=(0.05, 0.35), save_dir=None):
        """
        模拟BET比表面积分析数据
        
        BET (Brunauer-Emmett-Teller) 用于测定材料的比表面积
        基于N2吸附等温线
        
        参数:
        pressure_range: 相对压力范围 (P/P0)
        save_dir: 保存目录
        
        返回:
        bet_data: BET分析数据
        """
        # 相对压力点
        p_p0 = np.linspace(0.01, 0.99, 100)
        
        # MATBG的BET参数
        # 单层石墨烯理论比表面积约2630 m²/g
        # MATBG由于堆叠，实际比表面积较低
        moire_period = self.system.material_params['moire_period'] * 1e9  # nm
        
        # 基于摩尔周期估算比表面积
        # 双层石墨烯约为单层的一半，加上摩尔结构的贡献
        base_surface_area = 600  # m²/g (双层石墨烯基础值)
        enhancement = 1 + 0.02 * moire_period  # 摩尔周期增强
        specific_surface_area = base_surface_area * enhancement
        
        # BET常数
        C = 150  # BET常数，与吸附热相关
        Vm = specific_surface_area / 4.35  # 单层吸附量 (cm³/g STP)
        
        # BET吸附等温线
        # V = Vm * C * P/P0 / ((1 - P/P0) * (1 + (C-1) * P/P0))
        numerator = Vm * C * p_p0
        denominator = (1 - p_p0) * (1 + (C - 1) * p_p0)
        # 避免除零
        denominator = np.where(denominator == 0, 1e-10, denominator)
        volume_adsorbed = numerator / denominator
        
        # 添加噪声
        volume_adsorbed = self.system.generate_noise(volume_adsorbed, noise_level=0.02)
        volume_adsorbed = np.maximum(volume_adsorbed, 0)
        
        # BET线性拟合区域 (P/P0 = 0.05-0.35)
        bet_mask = (p_p0 >= pressure_range[0]) & (p_p0 <= pressure_range[1])
        p_p0_bet = p_p0[bet_mask]
        v_bet = volume_adsorbed[bet_mask]
        
        # BET变换: P/P0 / V(1-P/P0) vs P/P0
        denominator_bet = v_bet * (1 - p_p0_bet)
        denominator_bet = np.where(denominator_bet == 0, 1e-10, denominator_bet)
        y_bet = p_p0_bet / denominator_bet
        
        # 线性拟合
        slope, intercept = np.polyfit(p_p0_bet, y_bet, 1)
        
        # 计算BET参数 - 避免除零和负值
        if abs(slope + intercept) > 1e-10 and abs(intercept) > 1e-10:
            Vm_calc = 1 / (slope + intercept)
            C_calc = 1 + slope / intercept
        else:
            Vm_calc = Vm
            C_calc = C
        
        # 确保Vm_calc为正值
        Vm_calc = abs(Vm_calc)
        
        # 计算比表面积 (使用N2分子截面积 0.162 nm²)
        # S = Vm * N_A * σ / (V_m * m)
        # 其中 Vm 是单层吸附体积(cm³/g STP), V_m是标准摩尔体积
        N_A = 6.022e23  # 阿伏伽德罗常数
        sigma = 0.162e-18  # N2分子截面积 (m²)
        V_m = 22414  # 标准摩尔体积 (cm³/mol)
        
        # 正确的比表面积计算
        calculated_surface_area = (Vm_calc * N_A * sigma) / V_m  # m²/g
        
        # 确保结果在合理范围内 (100-1500 m²/g)
        calculated_surface_area = np.clip(calculated_surface_area, 100, 1500)
        
        # 孔径分布 (BJH方法简化)
        pore_diameters = np.linspace(1, 50, 50)  # nm
        # 假设主要为介孔，中心在5-10 nm
        pore_volume = 0.3 * np.exp(-((pore_diameters - 8)**2) / 20) + \
                      0.1 * np.exp(-((pore_diameters - 2)**2) / 2)
        pore_volume = self.system.generate_noise(pore_volume, noise_level=0.05)
        pore_volume = np.maximum(pore_volume, 0)
        
        # 总孔容
        total_pore_volume = np.trapz(pore_volume, pore_diameters) / 100  # cm³/g
        
        # 平均孔径
        pore_sum = np.sum(pore_volume)
        if pore_sum > 0:
            average_pore_diameter = np.sum(pore_diameters * pore_volume) / pore_sum
        else:
            average_pore_diameter = 8.0  # 默认值
        
        bet_data = {
            'relative_pressure': p_p0,
            'volume_adsorbed': volume_adsorbed,
            'bet_region_p_p0': p_p0_bet,
            'bet_region_y': y_bet,
            'bet_slope': slope,
            'bet_intercept': intercept,
            'specific_surface_area_m2_g': calculated_surface_area,
            'bet_constant_C': abs(C_calc),
            'monolayer_volume_cm3_g': Vm_calc,
            'pore_diameters_nm': pore_diameters,
            'pore_volume_distribution': pore_volume,
            'total_pore_volume_cm3_g': total_pore_volume,
            'average_pore_diameter_nm': average_pore_diameter,
            'adsorbate': 'N2',
            'temperature': '77 K'
        }
        
        if save_dir:
            self._save_bet_data(bet_data, save_dir)
        
        return bet_data
    
    def _save_bet_data(self, bet_data, save_dir):
        """保存BET数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存吸附等温线
        isotherm_df = pd.DataFrame({
            'Relative_Pressure_P_P0': bet_data['relative_pressure'],
            'Volume_Adsorbed_cm3_g_STP': bet_data['volume_adsorbed']
        })
        isotherm_df.to_csv(os.path.join(save_dir, 'bet_isotherm.csv'), index=False)
        
        # 保存BET线性区域数据
        bet_linear_df = pd.DataFrame({
            'P_P0': bet_data['bet_region_p_p0'],
            'BET_Transform': bet_data['bet_region_y']
        })
        bet_linear_df.to_csv(os.path.join(save_dir, 'bet_linear_region.csv'), index=False)
        
        # 保存孔径分布
        pore_df = pd.DataFrame({
            'Pore_Diameter_nm': bet_data['pore_diameters_nm'],
            'dV_dD_cm3_g_nm': bet_data['pore_volume_distribution']
        })
        pore_df.to_csv(os.path.join(save_dir, 'pore_size_distribution.csv'), index=False)
        
        # 保存汇总结果
        summary = {
            'Specific_Surface_Area_m2_g': bet_data['specific_surface_area_m2_g'],
            'BET_Constant_C': bet_data['bet_constant_C'],
            'Monolayer_Volume_cm3_g': bet_data['monolayer_volume_cm3_g'],
            'Total_Pore_Volume_cm3_g': bet_data['total_pore_volume_cm3_g'],
            'Average_Pore_Diameter_nm': bet_data['average_pore_diameter_nm'],
            'Adsorbate': bet_data['adsorbate'],
            'Temperature': bet_data['temperature']
        }
        summary_df = pd.DataFrame([summary])
        summary_df.to_csv(os.path.join(save_dir, 'bet_summary.csv'), index=False)

def main():
    """测试材料表征模拟器"""
    # [修复] 原模块名错误，core_system不存在
    # 原代码: from core_system import MATBGSimulationSystem
    # 修改为: from core_system_revised import MATBGSimulationSystem
    from core_system_revised import MATBGSimulationSystem
    
    # 初始化系统
    matbg_system = MATBGSimulationSystem(twist_angle=1.1)
    characterization_sim = MaterialCharacterizationSimulator(matbg_system)
    
    print("开始材料表征模拟...")
    
    # 模拟各种表征数据
    print("1. 模拟SEM图像...")
    sem_data = characterization_sim.simulate_sem_image(save_dir="simulation_results/characterization")
    
    print("2. 模拟TEM图像...")
    tem_data = characterization_sim.simulate_tem_image(save_dir="simulation_results/characterization")
    
    print("3. 模拟XRD图谱...")
    xrd_data = characterization_sim.simulate_xrd_pattern(save_dir="simulation_results/characterization")
    
    print("4. 模拟拉曼光谱...")
    raman_data = characterization_sim.simulate_raman_spectrum(save_dir="simulation_results/characterization")
    
    print("5. 模拟AFM形貌...")
    afm_data = characterization_sim.simulate_afm_topography(save_dir="simulation_results/characterization")
    
    print("材料表征模拟完成！")
    return characterization_sim

if __name__ == "__main__":
    simulator = main()

